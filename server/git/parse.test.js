import { describe, it, expect } from 'vitest'
import { splitZ, parseNameStatusZ, parseNumstatZ } from './parse.js'

describe('parseNameStatusZ', () => {
  it.each([
    ['A', 'A'],
    ['M', 'M'],
    ['D', 'D']
  ])('parses an ordinary %s record', (code, status) => {
    const text = `${code}\0a.txt\0`
    expect(parseNameStatusZ(text)).toEqual([{ status, path: 'a.txt', oldPath: null }])
  })

  it('strips the similarity score and populates oldPath for a rename', () => {
    const text = 'R100\0old.txt\0new.txt\0'
    expect(parseNameStatusZ(text)).toEqual([{ status: 'R', path: 'new.txt', oldPath: 'old.txt' }])
  })

  it('strips the similarity score and populates oldPath for a copy', () => {
    const text = 'C75\0src.txt\0copy.txt\0'
    expect(parseNameStatusZ(text)).toEqual([{ status: 'C', path: 'copy.txt', oldPath: 'src.txt' }])
  })

  it('does not let a rename desync the stride for records that follow', () => {
    const text = 'R100\0old.txt\0new.txt\0M\0b.txt\0D\0c.txt\0'
    expect(parseNameStatusZ(text)).toEqual([
      { status: 'R', path: 'new.txt', oldPath: 'old.txt' },
      { status: 'M', path: 'b.txt', oldPath: null },
      { status: 'D', path: 'c.txt', oldPath: null }
    ])
  })

  it('does not let a copy desync the stride for records that follow', () => {
    const text = 'C75\0src.txt\0copy.txt\0M\0b.txt\0D\0c.txt\0'
    expect(parseNameStatusZ(text)).toEqual([
      { status: 'C', path: 'copy.txt', oldPath: 'src.txt' },
      { status: 'M', path: 'b.txt', oldPath: null },
      { status: 'D', path: 'c.txt', oldPath: null }
    ])
  })

  it('returns an empty array for an empty string', () => {
    expect(parseNameStatusZ('')).toEqual([])
  })

  it('returns what it can from a truncated stream without throwing or looping', () => {
    const text = 'M\0a.txt\0R100\0'
    expect(parseNameStatusZ(text)).toEqual([{ status: 'M', path: 'a.txt', oldPath: null }])
  })
})

describe('parseNumstatZ', () => {
  it('parses an ordinary record', () => {
    const text = '3\t1\ta.txt\0'
    expect(parseNumstatZ(text)).toEqual([
      { path: 'a.txt', oldPath: null, added: 3, removed: 1, binary: false }
    ])
  })

  it('parses a binary record with zero counts', () => {
    const text = '-\t-\tlogo.png\0'
    expect(parseNumstatZ(text)).toEqual([
      { path: 'logo.png', oldPath: null, added: 0, removed: 0, binary: true }
    ])
  })

  it('parses a rename with the empty inline path', () => {
    const text = '2\t0\t\0old.txt\0new.txt\0'
    expect(parseNumstatZ(text)).toEqual([
      { path: 'new.txt', oldPath: 'old.txt', added: 2, removed: 0, binary: false }
    ])
  })

  it('does not let a rename desync the stride for records that follow', () => {
    const text = '2\t0\t\0old.txt\0new.txt\0' + '5\t2\tb.txt\0'
    expect(parseNumstatZ(text)).toEqual([
      { path: 'new.txt', oldPath: 'old.txt', added: 2, removed: 0, binary: false },
      { path: 'b.txt', oldPath: null, added: 5, removed: 2, binary: false }
    ])
  })

  it('returns an empty array for an empty string', () => {
    expect(parseNumstatZ('')).toEqual([])
  })
})

describe('splitZ', () => {
  it('splits on NUL and drops empty tokens', () => {
    expect(splitZ('a\0b\0\0c\0')).toEqual(['a', 'b', 'c'])
  })

  it('returns an empty array for an empty string', () => {
    expect(splitZ('')).toEqual([])
  })
})
