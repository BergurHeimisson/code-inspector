import { describe, it, expect, beforeAll } from 'vitest'
import { createRef } from 'react'
import { render, screen } from '@testing-library/react'
import FileView from './FileView.jsx'

// jsdom reports every element as zero-sized, which makes the virtualiser
// render nothing. Give it a viewport so rows are produced. @tanstack/virtual-core
// sizes the scroll container from offsetWidth/offsetHeight, not getBoundingClientRect,
// so both need patching here. No afterAll restore is needed: vitest's default
// per-file isolation discards the whole jsdom realm between files, so this patch
// never leaks. That stops being true if `isolate: false` is ever set.
beforeAll(() => {
  Element.prototype.getBoundingClientRect = function getBoundingClientRect() {
    return { width: 800, height: 600, top: 0, left: 0, right: 800, bottom: 600, x: 0, y: 0 }
  }
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 800 })
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 600 })
})

const view = (overrides = {}) => ({
  path: 'src/a.js',
  oldPath: null,
  status: 'M',
  binary: false,
  tooLarge: false,
  lines: [
    { n: 1, text: 'const a = 1', state: 'unchanged' },
    { n: 2, text: 'const b = 2', state: 'added' }
  ],
  deletions: [],
  ...overrides
})

describe('FileView', () => {
  it('shows a prompt when nothing is selected', () => {
    render(<FileView view={null} lineHeight={20} />)
    expect(screen.getByText('Select a file')).toBeInTheDocument()
  })

  it('renders the file path in the header', () => {
    render(<FileView view={view()} lineHeight={20} />)
    expect(screen.getByText('src/a.js')).toBeInTheDocument()
  })

  it('renders line numbers and text', () => {
    render(<FileView view={view()} lineHeight={20} />)
    expect(screen.getByText('const a = 1')).toBeInTheDocument()
    expect(screen.getByText('const b = 2')).toBeInTheDocument()
  })

  it('tags each line with its change state', () => {
    render(<FileView view={view()} lineHeight={20} />)
    expect(screen.getByText('const a = 1').closest('[data-state]'))
      .toHaveAttribute('data-state', 'unchanged')
    expect(screen.getByText('const b = 2').closest('[data-state]'))
      .toHaveAttribute('data-state', 'added')
  })

  it('renders a deletion marker', () => {
    render(<FileView view={view({ deletions: [{ after: 1, count: 3 }] })} lineHeight={20} />)
    expect(screen.getByText('3 lines deleted')).toBeInTheDocument()
  })

  it('renders a singular deletion marker', () => {
    render(<FileView view={view({ deletions: [{ after: 1, count: 1 }] })} lineHeight={20} />)
    expect(screen.getByText('1 line deleted')).toBeInTheDocument()
  })

  it('shows a stub for a binary file', () => {
    render(<FileView view={view({ binary: true, lines: [] })} lineHeight={20} />)
    expect(screen.getByText('Binary file')).toBeInTheDocument()
  })

  it('shows a stub for an oversized file', () => {
    render(<FileView view={view({ tooLarge: true, lines: [] })} lineHeight={20} />)
    expect(screen.getByText('File too large to display')).toBeInTheDocument()
  })

  it('shows the old path for a rename', () => {
    render(<FileView view={view({ status: 'R', oldPath: 'src/old.js' })} lineHeight={20} />)
    expect(screen.getByText('renamed from src/old.js')).toBeInTheDocument()
  })

  // Pins the wiring between the lineHeight prop and each row's rendered
  // height only. jsdom performs no box layout, so this cannot confirm the
  // rows actually line up on screen — only a real browser can do that.
  it('sizes a line row from a non-default lineHeight prop', () => {
    render(<FileView view={view()} lineHeight={28} />)
    const rowEl = screen.getByText('const a = 1').closest('[data-state]')
    expect(rowEl.style.height).toBe('28px')
    expect(rowEl.style.lineHeight).toBe('28px')
  })

  it('sizes a deletion row from a non-default lineHeight prop', () => {
    render(<FileView view={view({ deletions: [{ after: 1, count: 2 }] })} lineHeight={28} />)
    const rowEl = screen.getByText('2 lines deleted').closest('div')
    expect(rowEl.style.height).toBe('28px')
  })

  // buildRows produces one row per line when there are no deletions, so a
  // line's row index is its 1-based line number minus one.
  const bigView = (path, total, addedLines) =>
    view({
      path,
      lines: Array.from({ length: total }, (_, i) => ({
        n: i + 1,
        text: `l${i + 1}`,
        state: addedLines.includes(i + 1) ? 'added' : 'unchanged'
      }))
    })

  const deletedFileView = (total) =>
    view({
      status: 'D',
      lines: Array.from({ length: total }, (_, i) => ({ n: i + 1, text: `l${i + 1}`, state: 'deleted' }))
    })

  describe('jumpChange navigation', () => {
    it('reaches a change far outside the virtualised render window', () => {
      const ref = createRef()
      render(<FileView ref={ref} view={bigView('src/a.js', 2000, [1000])} lineHeight={20} />)
      expect(ref.current.jumpChange(1)).toBe(999)
    })

    it('pressing n twice reaches the second change, not the first again', () => {
      const ref = createRef()
      render(<FileView ref={ref} view={bigView('src/a.js', 2000, [100, 200])} lineHeight={20} />)
      expect(ref.current.jumpChange(1)).toBe(99)
      expect(ref.current.jumpChange(1)).toBe(199)
    })

    it('reaches changes in a fully deleted file', () => {
      const ref = createRef()
      render(<FileView ref={ref} view={deletedFileView(50)} lineHeight={20} />)
      expect(ref.current.jumpChange(1)).toBe(0)
    })

    it('treats a consecutive changed block as a single stop', () => {
      const ref = createRef()
      render(<FileView ref={ref} view={bigView('src/a.js', 20, [5, 6, 7, 8, 9])} lineHeight={20} />)
      expect(ref.current.jumpChange(1)).toBe(4)
      // Only one group exists, so the next n wraps back to the same block
      // rather than stepping to line 6 within it.
      expect(ref.current.jumpChange(1)).toBe(4)
    })

    it('wraps from the last change back to the first', () => {
      const ref = createRef()
      render(<FileView ref={ref} view={bigView('src/a.js', 2000, [100, 200])} lineHeight={20} />)
      expect(ref.current.jumpChange(-1)).toBe(199)
      expect(ref.current.jumpChange(1)).toBe(99)
    })

    it('resets the cursor when the viewed file changes', () => {
      const ref = createRef()
      const { rerender } = render(
        <FileView ref={ref} view={bigView('src/a.js', 2000, [50, 150])} lineHeight={20} />
      )
      expect(ref.current.jumpChange(-1)).toBe(149)

      rerender(<FileView ref={ref} view={bigView('src/b.js', 2000, [10, 20, 30])} lineHeight={20} />)
      expect(ref.current.jumpChange(1)).toBe(9)
    })
  })

  it('resets scroll position when the viewed file changes', () => {
    const { container, rerender } = render(<FileView view={view()} lineHeight={20} />)
    const scrollEl = container.querySelector('.overflow-auto')
    scrollEl.scrollTop = 500

    rerender(<FileView view={view({ path: 'src/b.js' })} lineHeight={20} />)
    expect(container.querySelector('.overflow-auto').scrollTop).toBe(0)
  })
})
