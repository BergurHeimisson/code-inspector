import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
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

  // jsdom also leaves clientHeight/scrollHeight at 0 regardless of inline
  // styles (no layout engine), and @tanstack/virtual-core clamps every
  // scrollToIndex target to `scrollHeight - clientHeight`. Left unpatched,
  // every jump silently clamps to 0 and a scroll-assertion test can't tell a
  // working jump from the reported bug — both look like { top: 0 }. clientHeight
  // mirrors the fixed viewport; scrollHeight reads the virtualiser's own sizer
  // div (its first child, given the height it sets from getTotalSize()).
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, value: 600 })
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    get() {
      const child = this.firstElementChild
      const childHeight = child && parseFloat(child.style.height)
      return Number.isFinite(childHeight) ? childHeight : 600
    }
  })

  // This jsdom build has no Element.prototype.scrollTo at all (verified: reading
  // it is `undefined`, not a stub), and @tanstack/virtual-core's scroll adapter
  // calls `scrollElement.scrollTo?.(...)` — so without this, a jumpChange call
  // silently no-ops and no test can ever observe whether a scroll was requested.
  // Implement it the way a real scrollable element would: write the offset to
  // scrollTop.
  if (!Element.prototype.scrollTo) {
    Element.prototype.scrollTo = function scrollTo(options) {
      if (typeof options !== 'object' || options === null) return
      if (typeof options.top === 'number') this.scrollTop = options.top
      if (typeof options.left === 'number') this.scrollLeft = options.left
    }
  }
})

// Mirrors @tanstack/virtual-core's getOffsetForAlignment for align: 'center'
// with our fixed-size rows (estimateSize is a constant lineHeight, so every
// row's start is index * lineHeight): toOffset = itemStart + (itemSize -
// viewport) / 2, clamped to [0, totalSize - viewport]. Used to assert
// scrollTo was invoked for the RIGHT target, not just invoked at all.
const expectedOffset = (index, rowCount, lineHeight = 20, viewport = 600) => {
  const raw = index * lineHeight + (lineHeight - viewport) / 2
  const maxOffset = Math.max(rowCount * lineHeight - viewport, 0)
  return Math.max(Math.min(maxOffset, raw), 0)
}

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

  // Regression coverage, not a red/green demonstration: `git log` shows this
  // feature was broken and shipped broken twice because every prior test
  // asserted only jumpChange's return value, never that a scroll was actually
  // requested. These assert against the scroll mechanism itself so a future
  // regression that leaves the return value correct but the view unmoved
  // (the exact shape of the bug that shipped) fails here.
  describe('jumpChange scroll mechanism', () => {
    let scrollToSpy

    beforeEach(() => {
      scrollToSpy = vi.spyOn(Element.prototype, 'scrollTo')
    })

    afterEach(() => {
      scrollToSpy.mockRestore()
    })

    it('n from an unset cursor scrolls to the first group, and a second n scrolls to the second', () => {
      const ref = createRef()
      render(<FileView ref={ref} view={bigView('src/a.js', 2000, [100, 200])} lineHeight={20} />)
      // The virtualizer's own mount-time measurement can issue a scroll
      // adjustment unrelated to jumpChange; only count calls from here on.
      scrollToSpy.mockClear()

      ref.current.jumpChange(1)
      expect(scrollToSpy).toHaveBeenCalledTimes(1)
      expect(scrollToSpy.mock.calls[0][0]).toMatchObject({ top: expectedOffset(99, 2000) })

      ref.current.jumpChange(1)
      expect(scrollToSpy).toHaveBeenCalledTimes(2)
      const [firstCall, secondCall] = scrollToSpy.mock.calls
      expect(secondCall[0]).toMatchObject({ top: expectedOffset(199, 2000) })
      // The heart of the regression: two presses must target two different
      // offsets. A cursor stuck resolving to the same group every time (the
      // bug as reported) would pass on return value alone but fail here.
      expect(secondCall[0].top).not.toBe(firstCall[0].top)
    })

    it('p from an unset cursor scrolls to the last group', () => {
      const ref = createRef()
      render(<FileView ref={ref} view={bigView('src/a.js', 2000, [100, 200])} lineHeight={20} />)
      scrollToSpy.mockClear()

      ref.current.jumpChange(-1)
      expect(scrollToSpy).toHaveBeenCalledTimes(1)
      expect(scrollToSpy.mock.calls[0][0]).toMatchObject({ top: expectedOffset(199, 2000) })
    })

    it('wraps scroll targets at both ends', () => {
      const ref = createRef()
      render(<FileView ref={ref} view={bigView('src/a.js', 2000, [100, 200])} lineHeight={20} />)
      scrollToSpy.mockClear()

      ref.current.jumpChange(1) // group 0 (row 99)
      ref.current.jumpChange(1) // group 1 (row 199)
      ref.current.jumpChange(1) // wraps back to group 0
      expect(scrollToSpy).toHaveBeenCalledTimes(3)
      expect(scrollToSpy.mock.calls[2][0]).toMatchObject({ top: expectedOffset(99, 2000) })

      ref.current.jumpChange(-1) // wraps to group 1
      expect(scrollToSpy).toHaveBeenCalledTimes(4)
      expect(scrollToSpy.mock.calls[3][0]).toMatchObject({ top: expectedOffset(199, 2000) })
    })

    it('invokes no scroll at all for a file with no changes', () => {
      const ref = createRef()
      render(<FileView ref={ref} view={bigView('src/a.js', 50, [])} lineHeight={20} />)
      scrollToSpy.mockClear()

      expect(ref.current.jumpChange(1)).toBeNull()
      expect(scrollToSpy).not.toHaveBeenCalled()
    })

    it('scrolls to the new file\'s first group on the first n after switching files', () => {
      const ref = createRef()
      const { rerender } = render(
        <FileView ref={ref} view={bigView('src/a.js', 2000, [50, 150])} lineHeight={20} />
      )
      ref.current.jumpChange(-1) // last group of a.js, row 149
      scrollToSpy.mockClear()

      rerender(<FileView ref={ref} view={bigView('src/b.js', 2000, [10, 20, 30])} lineHeight={20} />)
      ref.current.jumpChange(1)

      expect(scrollToSpy).toHaveBeenCalledTimes(1)
      expect(scrollToSpy.mock.calls[0][0]).toMatchObject({ top: expectedOffset(9, 2000) })
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
