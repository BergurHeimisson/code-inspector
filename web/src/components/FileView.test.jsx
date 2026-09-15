import { describe, it, expect, beforeAll } from 'vitest'
import { render, screen } from '@testing-library/react'
import FileView from './FileView.jsx'

// jsdom reports every element as zero-sized, which makes the virtualiser
// render nothing. Give it a viewport so rows are produced. @tanstack/virtual-core
// sizes the scroll container from offsetWidth/offsetHeight, not getBoundingClientRect,
// so both need patching here.
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
})
