import { describe, it, expect, beforeEach } from 'vitest'
import { applyTheme, resolveTheme } from './theme.js'

describe('applyTheme', () => {
  let root

  beforeEach(() => {
    root = document.createElement('div')
  })

  it('writes every token as a CSS custom property', () => {
    applyTheme(
      {
        surface: '#111111',
        text: '#eeeeee',
        border: '#333333',
        added: '#d98a30',
        unchanged: '#2f6b4a',
        deleted: '#8a3030'
      },
      root
    )

    expect(root.style.getPropertyValue('--color-surface')).toBe('#111111')
    expect(root.style.getPropertyValue('--color-added')).toBe('#d98a30')
    expect(root.style.getPropertyValue('--color-deleted')).toBe('#8a3030')
  })

  it('ignores tokens it does not know', () => {
    applyTheme({ surface: '#111111', bogus: 'nope' }, root)
    expect(root.style.getPropertyValue('--color-bogus')).toBe('')
  })
})

describe('resolveTheme', () => {
  const config = { defaultTheme: 'dark' }

  it('prefers the remembered theme', () => {
    expect(resolveTheme(config, { theme: 'light' })).toBe('light')
  })

  it('falls back to the config default', () => {
    expect(resolveTheme(config, { theme: null })).toBe('dark')
  })

  it('falls back to dark when nothing is set', () => {
    expect(resolveTheme({}, {})).toBe('dark')
  })
})
