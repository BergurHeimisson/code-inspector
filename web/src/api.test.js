import { describe, it, expect } from 'vitest'
import { rangeToParam } from './api.js'

describe('rangeToParam', () => {
  it('defaults to auto', () => {
    expect(rangeToParam({ mode: 'auto' })).toBe('auto')
  })

  it('serialises worktree', () => {
    expect(rangeToParam({ mode: 'worktree' })).toBe('worktree')
  })

  it('serialises commits with the count', () => {
    expect(rangeToParam({ mode: 'commits', n: 5 })).toBe('commits:5')
  })

  it('serialises ref with the ref name', () => {
    expect(rangeToParam({ mode: 'ref', ref: 'origin/main' })).toBe('ref:origin/main')
  })
})
