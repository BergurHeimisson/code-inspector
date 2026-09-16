import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import FileTree from './FileTree.jsx'

const file = (path, extra = {}) => ({
  path,
  oldPath: null,
  status: 'M',
  added: 2,
  removed: 1,
  binary: false,
  ...extra
})

describe('FileTree', () => {
  it('explains an empty auto range rather than just saying no changes', () => {
    render(<FileTree files={[]} range={{ mode: 'auto' }} selectedPath={null} onSelect={() => {}} />)
    expect(screen.getByText('No changes')).toBeInTheDocument()
    expect(
      screen.getByText(/nothing unpushed.*no local edits/i)
    ).toBeInTheDocument()
    expect(screen.getByText(/range dropdown/i)).toBeInTheDocument()
  })

  it('does not blame the branch when an explicit range is empty', () => {
    render(<FileTree files={[]} range={{ mode: 'commits', n: 2 }} selectedPath={null} onSelect={() => {}} />)
    expect(screen.getByText('No changes')).toBeInTheDocument()
    expect(screen.queryByText(/nothing unpushed/i)).not.toBeInTheDocument()
  })

  it('renders directories and files', () => {
    render(
      <FileTree
        files={[file('src/feed/parse.js'), file('README.md')]}
        selectedPath={null}
        onSelect={() => {}}
      />
    )
    expect(screen.getByText('src/feed')).toBeInTheDocument()
    expect(screen.getByText('parse.js')).toBeInTheDocument()
    expect(screen.getByText('README.md')).toBeInTheDocument()
  })

  it('calls onSelect with the full path when a file is clicked', async () => {
    const onSelect = vi.fn()
    render(
      <FileTree files={[file('src/a.js')]} selectedPath={null} onSelect={onSelect} />
    )
    await userEvent.click(screen.getByText('a.js'))
    expect(onSelect).toHaveBeenCalledWith('src/a.js')
  })

  it('marks the selected file', () => {
    render(
      <FileTree files={[file('src/a.js')]} selectedPath="src/a.js" onSelect={() => {}} />
    )
    expect(screen.getByText('a.js').closest('button')).toHaveAttribute('aria-current', 'true')
  })

  it('collapses and expands a directory', async () => {
    render(<FileTree files={[file('src/a.js')]} selectedPath={null} onSelect={() => {}} />)
    expect(screen.getByText('a.js')).toBeInTheDocument()

    await userEvent.click(screen.getByText('src'))
    expect(screen.queryByText('a.js')).not.toBeInTheDocument()

    await userEvent.click(screen.getByText('src'))
    expect(screen.getByText('a.js')).toBeInTheDocument()
  })

  it('shows per-file line counts', () => {
    render(
      <FileTree
        files={[file('a.js', { added: 24, removed: 6 })]}
        selectedPath={null}
        onSelect={() => {}}
      />
    )
    expect(screen.getByText('+24')).toBeInTheDocument()
    expect(screen.getByText('−6')).toBeInTheDocument()
  })

  it('summarises the branch in the footer', () => {
    render(
      <FileTree
        files={[file('a.js', { added: 10, removed: 2 }), file('b.js', { added: 5, removed: 1 })]}
        selectedPath={null}
        onSelect={() => {}}
      />
    )
    expect(screen.getByText('2 files +15 −3')).toBeInTheDocument()
  })

  it('colours a file visited at the counts it was seen at', () => {
    render(
      <FileTree
        files={[file('a.js', { added: 2, removed: 1 })]}
        visited={{ 'a.js': '2/1' }}
        range={{ mode: 'auto' }}
        selectedPath={null}
        onSelect={() => {}}
      />
    )

    expect(screen.getByText('a.js')).toHaveStyle({ color: 'var(--color-visited)' })
  })

  it('drops the mark once the file has changed again', () => {
    render(
      <FileTree
        files={[file('a.js', { added: 9, removed: 1 })]}
        visited={{ 'a.js': '2/1' }}
        range={{ mode: 'auto' }}
        selectedPath={null}
        onSelect={() => {}}
      />
    )

    expect(screen.getByText('a.js')).not.toHaveStyle({ color: 'var(--color-visited)' })
  })

  it('leaves an unvisited file alone', () => {
    render(
      <FileTree
        files={[file('a.js')]}
        visited={{}}
        range={{ mode: 'auto' }}
        selectedPath={null}
        onSelect={() => {}}
      />
    )

    expect(screen.getByText('a.js')).not.toHaveStyle({ color: 'var(--color-visited)' })
  })
})
