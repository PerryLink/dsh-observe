/**
 * The bounded offline buffer: a storage-domain table holding sanitized
 * export batches that could not be delivered. Batches are written when the
 * in-memory queue overflows or after retries are exhausted, and drained on
 * a timer; the bound is a total record count, and pushing past it drops the
 * OLDEST records (reported through the drop callback so the OTLP backend
 * can count them). The buffer survives restarts: the domain reloads from
 * the host's storage backend.
 * @module dsh-observe/spool
 */

import type { Domain, KvTable } from '@deepseek-ai/dsh-storage-domain'
import { defineDomain } from '@deepseek-ai/dsh-storage-domain'
import { z } from 'zod'
import type { BackendName, ExportRecord } from './model.ts'
import { isExportRecord } from './model.ts'

/** One stored batch: creation time plus sanitized export records. */
const spoolBatchSchema = z.object({
  createdAt: z.number().int().nonnegative(),
  records: z.array(z.unknown()),
})

/** The durable record type validated by the domain on load. */
export type SpoolBatchValue = z.infer<typeof spoolBatchSchema>

/** The dsh-observe storage domain declaration. */
export const observeDomainSpec = defineDomain({
  name: 'observe',
  version: 1,
  tables: {
    spool: { valueSchema: spoolBatchSchema },
  },
})

/** Domain spec type for the spool table. */
export type ObserveDomainSpec = typeof observeDomainSpec

/** One batch read back from the spool, validated record-wise. */
export interface SpoolBatch {
  backend: BackendName
  key: string
  createdAt: number
  records: ExportRecord[]
}

/** A monotonic, zero-padded key for lexicographically ordered batches. */
function batchKey(backend: BackendName, seq: number): string {
  return `${backend}:${String(seq).padStart(16, '0')}`
}

/** Per-backend occupancy snapshot for status surfaces. */
export interface SpoolCounts {
  batches: number
  records: number
}

/**
 * The offline buffer over one storage-domain table. The domain itself is
 * opened and closed by the runtime; the spool only owns the table handle.
 */
export class Spool {
  private nextSeq = 0
  private bufferedRecords = 0

  /**
   * @param table - the domain `spool` table handle.
   * @param maxBufferRecords - total record bound across all backends.
   * @param onDropped - receives the count of records dropped by bound eviction.
   * @param onInvalid - receives the count of stored records rejected by validation.
   */
  constructor(
    private readonly table: KvTable<string, SpoolBatchValue>,
    private readonly maxBufferRecords: number,
    private readonly onDropped: (count: number) => void,
    private readonly onInvalid: (count: number) => void,
  ) {
    for (const [key, value] of this.table.entries()) {
      const match = /^[a-z]+:(\d+)$/u.exec(key)
      if (match !== null && match[1] !== undefined) {
        this.nextSeq = Math.max(this.nextSeq, Number(match[1]) + 1)
      }
      this.bufferedRecords += value.records.length
    }
  }

  /** All batches in chronological write order (createdAt, then key). */
  private ordered(): [string, SpoolBatchValue][] {
    return [...this.table.entries()].sort((left, right) =>
      left[1].createdAt - right[1].createdAt || left[0].localeCompare(right[0]))
  }

  /**
   * Spill one batch into the buffer, enforcing the record bound: when the
   * batch alone exceeds the bound only its newest records are kept, and
   * otherwise the oldest stored batches are evicted until it fits. Drops
   * are reported through {@link onDropped}.
   * @param backend - the owning backend.
   * @param records - sanitized records to persist.
   * @returns resolution after the write and any evictions.
   */
  async push(backend: BackendName, records: ExportRecord[]): Promise<void> {
    if (records.length === 0) return
    let kept = records
    let dropped = 0
    if (kept.length > this.maxBufferRecords) {
      dropped += kept.length - this.maxBufferRecords
      kept = kept.slice(kept.length - this.maxBufferRecords)
    }
    while (this.bufferedRecords + kept.length > this.maxBufferRecords) {
      const oldest = this.ordered()[0]
      if (oldest === undefined) break
      await this.table.delete(oldest[0])
      this.bufferedRecords -= oldest[1].records.length
      dropped += oldest[1].records.length
    }
    const key = batchKey(backend, this.nextSeq)
    this.nextSeq += 1
    await this.table.put(key, { createdAt: Date.now(), records: kept })
    this.bufferedRecords += kept.length
    if (dropped > 0) this.onDropped(dropped)
  }

  /**
   * Read the oldest batches of one backend, up to a record budget. Stored
   * records that fail {@link isExportRecord} are dropped from the returned
   * set (and reported through {@link onInvalid}) but stay on disk until a
   * later `remove` deletes their batch.
   * @param backend - the backend to read.
   * @param maxRecords - record budget for one drain cycle.
   * @returns the batches (fully consumed, delete as a unit) and their records.
   */
  peek(backend: BackendName, maxRecords: number): { batches: SpoolBatch[]; records: ExportRecord[] } {
    const prefix = `${backend}:`
    const batches: SpoolBatch[] = []
    const records: ExportRecord[] = []
    for (const [key, value] of this.ordered()) {
      if (!key.startsWith(prefix)) continue
      const valid: ExportRecord[] = []
      for (const record of value.records) {
        if (isExportRecord(record)) valid.push(record)
      }
      if (valid.length !== value.records.length) this.onInvalid(value.records.length - valid.length)
      batches.push({ backend, key, createdAt: value.createdAt, records: valid })
      records.push(...valid)
      if (records.length >= maxRecords) break
    }
    return { batches, records }
  }

  /**
   * Delete delivered batches.
   * @param batches - the batches that were exported successfully.
   * @returns resolution after every delete.
   */
  async remove(batches: readonly SpoolBatch[]): Promise<void> {
    await Promise.all(batches.map(batch => this.table.delete(batch.key)))
    for (const batch of batches) {
      this.bufferedRecords -= batch.records.length
    }
  }

  /**
   * Per-backend occupancy.
   * @returns batch and record counts per backend.
   */
  counts(): Record<BackendName, SpoolCounts> {
    const counts: Record<BackendName, SpoolCounts> = {
      otlp: { batches: 0, records: 0 },
      langfuse: { batches: 0, records: 0 },
    }
    for (const [key, value] of this.table.entries()) {
      const backend: BackendName = key.startsWith('otlp:') ? 'otlp' : 'langfuse'
      counts[backend].batches += 1
      counts[backend].records += value.records.length
    }
    return counts
  }
}

/**
 * Open the offline buffer over an already-opened domain.
 * @param domain - the opened `observe` domain.
 * @param maxBufferRecords - total record bound.
 * @param onDropped - drop callback (bound eviction).
 * @param onInvalid - invalid-record callback (durable-boundary validation).
 * @returns the spool handle.
 */
export function openSpool(
  domain: Domain<ObserveDomainSpec>,
  maxBufferRecords: number,
  onDropped: (count: number) => void,
  onInvalid: (count: number) => void,
): Spool {
  return new Spool(domain.table('spool'), maxBufferRecords, onDropped, onInvalid)
}
