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
      'dark',
      root
    )

    expect(root.style.getPropertyValue('--color-surface')).toBe('#111111')
    expect(root.style.getPropertyValue('--color-added')).toBe('#d98a30')
    expect(root.style.getPropertyValue('--color-deleted')).toBe('#8a3030')
  })

  it('ignores tokens it does not know', () => {
    applyTheme({ surface: '#111111', bogus: 'nope' }, 'dark', root)
    expect(root.style.getPropertyValue('--color-bogus')).toBe('')
  })

  it('adds the dark class when the theme is dark', () => {
    applyTheme({}, 'dark', root)
    expect(root.classList.contains('dark')).toBe(true)
  })

  it('removes the dark class when the theme is light, even if already present', () => {
    root.classList.add('dark')
    applyTheme({}, 'light', root)
    expect(root.classList.contains('dark')).toBe(false)
  })

  it('converges when toggling dark -> light -> dark', () => {
    applyTheme({}, 'dark', root)
    applyTheme({}, 'light', root)
    applyTheme({}, 'dark', root)
    expect(root.classList.contains('dark')).toBe(true)
  })

  it('preserves an unrelated class across theme transitions', () => {
    root.classList.add('unrelated')
    applyTheme({}, 'dark', root)
    applyTheme({}, 'light', root)
    expect(root.classList.contains('unrelated')).toBe(true)
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
