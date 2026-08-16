/**
 * Export-record validation at the durable spool boundary: hand-edited or
 * hostile values must be rejected before they reach a sink.
 * @module dsh-observe/test/model.spec
 */

import { describe, expect, it } from 'vitest'
import { isExportRecord } from '../src/model.ts'

describe('isExportRecord', () => {
  it('accepts span and metric records', () => {
    expect(isExportRecord({ kind: 'span', span: { kind: 'turn' } })).toBe(true)
    expect(isExportRecord({ kind: 'metric', metric: { name: 'm' } })).toBe(true)
  })

  it('rejects non-objects and unknown kinds', () => {
    expect(isExportRecord(null)).toBe(false)
    expect(isExportRecord('span')).toBe(false)
    expect(isExportRecord([])).toBe(false)
    expect(isExportRecord({ kind: 'other' })).toBe(false)
    expect(isExportRecord({ kind: 'span' })).toBe(false)
    expect(isExportRecord({ kind: 'span', span: null })).toBe(false)
  })
})
