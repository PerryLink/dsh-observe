/**
 * The per-backend delivery pipeline: an in-memory queue, periodic and
 * size-triggered flushes, retry with exponential backoff, and spill-over
 * into the durable offline buffer (both when the queue bound is hit and
 * when retries are exhausted). Spool draining runs on its own cycle.
 * @module dsh-observe/pipeline
 */

import type { ResolvedBatch, ResolvedRetry } from './config.ts'
import type { BackendName, ExportRecord, MetricRecord } from './model.ts'
import { backoffDelayMs } from './backoff.ts'
import type { ObserveLogger, SpanSink } from './sinks.ts'
import type { Spool } from './spool.ts'

/** Everything one pipeline needs. */
export interface PipelineOptions {
  name: BackendName
  sink: SpanSink
  spool: Spool
  batch: ResolvedBatch
  retry: ResolvedRetry
  logger: ObserveLogger
  /** The runtime kill switch; when off, pushed records are dropped and counted. */
  isEnabled: () => boolean
  /** Operational metric sink (OTLP aggregation). */
  onMetric: (metric: MetricRecord) => void
}

/**
 * One backend's delivery pipeline. Push is synchronous (the session event
 * hot path); all network work happens on timers or in the background.
 */
export class Pipeline {
  private queue: ExportRecord[] = []
  private pending: ExportRecord[] | undefined
  private inFlight = false
  private consecutiveFailures = 0
  private retryTimer: ReturnType<typeof setTimeout> | undefined
  private disposed = false

  /**
   * @param options - the pipeline options (copied, never mutated).
   */
  constructor(private readonly options: PipelineOptions) {}

  /** Records currently queued or awaiting retry. */
  get depth(): number {
    return this.queue.length + (this.pending?.length ?? 0)
  }

  /** The backend this pipeline delivers to (`otlp` / `langfuse`). */
  get name(): BackendName {
    return this.options.name
  }

  /**
   * Queue one record. A disabled runtime drops it (counted); a full queue
   * spills it straight into the durable buffer (bounded; oldest records
   * there are evicted first).
   * @param record - the owned, sanitized record.
   */
  push(record: ExportRecord): void {
    if (this.disposed) return
    if (!this.options.isEnabled()) {
      this.options.onMetric({
        name: 'observe.dropped',
        kind: 'counter',
        unit: 'records',
        value: 1,
        attributes: { reason: 'disabled', backend: this.options.name },
      })
      return
    }
    if (this.queue.length < this.options.batch.maxQueueRecords) {
      this.queue.push(record)
      if (this.queue.length >= this.options.batch.maxRecords) this.kick()
      return
    }
    void this.options.spool.push(this.options.name, [record]).catch((error: unknown) => {
      this.options.logger.warn(`${this.options.name}: buffer spill failed: ${error instanceof Error ? error.message : String(error)}`)
    })
  }

  /** Start a flush immediately when no flush is already running or scheduled. */
  kick(): void {
    if (this.retryTimer !== undefined || this.inFlight) return
    void this.flushOnce()
  }

  /** The periodic flush entry point. */
  async tick(): Promise<void> {
    await this.flushOnce()
  }

  /** One flush attempt: pending retry batch first, otherwise the queue head. */
  private async flushOnce(): Promise<void> {
    if (this.inFlight || this.disposed) return
    const batch = this.pending ?? this.queue.splice(0, this.options.batch.maxRecords)
    if (batch.length === 0) return
    this.inFlight = true
    try {
      await this.options.sink.exportSpans(batch)
      this.consecutiveFailures = 0
      this.pending = undefined
    } catch (error) {
      this.consecutiveFailures += 1
      this.pending = batch
      if (this.consecutiveFailures >= this.options.retry.maxAttempts) {
        this.pending = undefined
        this.consecutiveFailures = 0
        await this.options.spool.push(this.options.name, batch)
        this.options.onMetric({
          name: 'observe.spooled',
          kind: 'counter',
          unit: 'records',
          value: batch.length,
          attributes: { backend: this.options.name },
        })
      } else {
        this.scheduleRetry()
      }
      this.options.onMetric({
        name: 'observe.export_failures',
        kind: 'counter',
        unit: 'requests',
        value: 1,
        attributes: { backend: this.options.name },
      })
      this.options.logger.warn(
        `${this.options.name}: export attempt ${this.consecutiveFailures} failed: ${error instanceof Error ? error.message : String(error)}`,
      )
    } finally {
      this.inFlight = false
    }
  }

  /** Schedule the backoff retry for the pending batch. */
  private scheduleRetry(): void {
    if (this.disposed || this.retryTimer !== undefined) return
    const delay = backoffDelayMs(this.consecutiveFailures, this.options.retry)
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined
      void this.flushOnce()
    }, delay)
  }

  /**
   * Try the oldest buffered batches once. Batches that fail stay in the
   * buffer for the next cycle; success deletes them.
   */
  async drainSpool(): Promise<void> {
    if (this.inFlight || this.disposed) return
    const { batches, records } = this.options.spool.peek(this.options.name, this.options.batch.maxRecords)
    if (records.length === 0) return
    this.inFlight = true
    try {
      await this.options.sink.exportSpans(records)
      await this.options.spool.remove(batches)
      this.consecutiveFailures = 0
      this.options.onMetric({
        name: 'observe.spool_flushed',
        kind: 'counter',
        unit: 'records',
        value: records.length,
        attributes: { backend: this.options.name },
      })
    } catch (error) {
      this.options.onMetric({
        name: 'observe.export_failures',
        kind: 'counter',
        unit: 'requests',
        value: 1,
        attributes: { backend: this.options.name, kind: 'buffer' },
      })
      this.options.logger.warn(`${this.options.name}: buffer drain failed: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      this.inFlight = false
    }
  }

  /**
   * Final flush on unload: one best-effort export of everything queued;
   * whatever fails goes to the durable buffer for the next process run.
   */
  async dispose(): Promise<void> {
    this.disposed = true
    if (this.retryTimer !== undefined) {
      clearTimeout(this.retryTimer)
      this.retryTimer = undefined
    }
    const batch = [...(this.pending ?? []), ...this.queue]
    this.queue = []
    this.pending = undefined
    if (batch.length === 0) return
    try {
      await this.options.sink.exportSpans(batch)
    } catch {
      try {
        await this.options.spool.push(this.options.name, batch)
      } catch (error) {
        this.options.logger.warn(`${this.options.name}: final buffer spill failed: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }
}
