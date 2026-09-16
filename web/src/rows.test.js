import { describe, it, expect } from 'vitest'
import { buildRows } from './rows.js'

const line = (n, state = 'unchanged') => ({ n, text: `l${n}`, state })

describe('buildRows', () => {
  it('returns lines unchanged when there are no deletions', () => {
    expect(buildRows([line(1), line(2)], [])).toEqual([
      { kind: 'line', n: 1, text: 'l1', state: 'unchanged' },
      { kind: 'line', n: 2, text: 'l2', state: 'unchanged' }
    ])
  })

  it('inserts a deletion row after the line it follows', () => {
    const rows = buildRows([line(1), line(2)], [{ after: 1, count: 3 }])
    expect(rows.map((r) => r.kind)).toEqual(['line', 'deletion', 'line'])
    expect(rows[1]).toEqual({ kind: 'deletion', after: 1, count: 3 })
  })

  it('places a deletion after line zero at the very top', () => {
    const rows = buildRows([line(1)], [{ after: 0, count: 2 }])
    expect(rows.map((r) => r.kind)).toEqual(['deletion', 'line'])
  })

  it('places a deletion past the last line at the end', () => {
    const rows = buildRows([line(1)], [{ after: 9, count: 1 }])
    expect(rows.map((r) => r.kind)).toEqual(['line', 'deletion'])
  })

  it('handles several deletions', () => {
    const rows = buildRows(
      [line(1), line(2), line(3)],
      [{ after: 1, count: 1 }, { after: 3, count: 2 }]
    )
    expect(rows.map((r) => r.kind)).toEqual(['line', 'deletion', 'line', 'line', 'deletion'])
  })

  it('handles an empty file with a deletion', () => {
    expect(buildRows([], [{ after: 0, count: 4 }])).toEqual([
      { kind: 'deletion', after: 0, count: 4 }
    ])
  })
})
