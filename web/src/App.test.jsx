import { describe, it, expect, vi, beforeEach } from 'vitest'
import { forwardRef } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App.jsx'
import { api } from './api.js'

vi.mock('./api.js', () => ({
  api: {
    initial: vi.fn(),
    project: vi.fn(),
    changes: vi.fn(),
    file: vi.fn(),
    fsList: vi.fn(),
    config: vi.fn(),
    state: vi.fn(),
    saveState: vi.fn(),
    rememberProject: vi.fn()
  },
  rangeToParam: (range) => range.mode
}))

// FileView's own tests cover its rendering; jsdom performs no box layout,
// which leaves its virtualiser producing zero rows here regardless of what
// App passes down. Stubbed so App's prop-wiring to FileView (lineHeight,
// tint) can be asserted directly instead of through virtualised DOM output.
vi.mock('./components/FileView.jsx', () => ({
  default: forwardRef(function FileViewStub({ view, lineHeight, tint }, ref) {
    return (
      <div
        data-testid="file-view-stub"
        data-line-height={lineHeight}
        data-tint={JSON.stringify(tint)}
      />
    )
  })
}))

const CONFIG = {
  defaultTheme: 'dark',
  maxFileBytes: 2097152,
  lineHeight: 20,
  tint: { added: 70, unchanged: 14, deleted: 40 },
  themes: {
    dark: {
      surface: '#1e1f29',
      text: '#f8f8f2',
      border: '#44475a',
      added: '#d98a30',
      unchanged: '#2f6b4a',
      deleted: '#8a3030'
    },
    light: {
      surface: '#ffffff',
      text: '#1e1f29',
      border: '#d0d2e0',
      added: '#b35c00',
      unchanged: '#1c6b3f',
      deleted: '#a11a1a'
    }
  }
}

const PROJECT = { root: '/repos/jetlog', name: 'jetlog', branch: 'main', base: 'abc', label: 'vs origin/main' }

const CHANGES = {
  root: '/repos/jetlog',
  base: 'abc',
  label: 'vs origin/main',
  files: [
    { path: 'src/a.js', oldPath: null, status: 'M', added: 2, removed: 1, binary: false },
    { path: 'src/b.js', oldPath: null, status: 'A', added: 5, removed: 0, binary: false }
  ]
}

const FILE = {
  path: 'src/a.js',
  oldPath: null,
  status: 'M',
  binary: false,
  tooLarge: false,
  lines: [{ n: 1, text: 'const a = 1', state: 'added' }],
  deletions: []
}

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset?.()
  api.config.mockResolvedValue(CONFIG)
  api.state.mockResolvedValue({ lastProject: null, recents: [], paneWidth: 280, theme: null })
  api.initial.mockResolvedValue({ path: '/repos/jetlog' })
  api.project.mockResolvedValue(PROJECT)
  api.changes.mockResolvedValue(CHANGES)
  api.file.mockResolvedValue(FILE)
  api.rememberProject.mockResolvedValue({ lastProject: '/repos/jetlog', recents: ['/repos/jetlog'] })
  api.saveState.mockResolvedValue({})
  api.fsList.mockResolvedValue({ path: '/home/me', parent: null, entries: [] })
})

describe('App', () => {
  it('opens the initial project and lists its changes', async () => {
    render(<App />)
    expect(await screen.findByText('jetlog')).toBeInTheDocument()
    expect(await screen.findByText('a.js')).toBeInTheDocument()
    expect(screen.getByText('b.js')).toBeInTheDocument()
  })

  it('remembers the opened project', async () => {
    render(<App />)
    await waitFor(() => expect(api.rememberProject).toHaveBeenCalledWith('/repos/jetlog'))
  })

  it('selects the first file automatically', async () => {
    render(<App />)
    await waitFor(() =>
      expect(api.file).toHaveBeenCalledWith('/repos/jetlog', 'src/a.js', { mode: 'auto' })
    )
  })

  it('loads a file when its row is clicked', async () => {
    render(<App />)
    await userEvent.click(await screen.findByText('b.js'))
    await waitFor(() =>
      expect(api.file).toHaveBeenLastCalledWith('/repos/jetlog', 'src/b.js', { mode: 'auto' })
    )
  })

  it('refetches when the range changes', async () => {
    render(<App />)
    await screen.findByText('a.js')
    await userEvent.selectOptions(screen.getByLabelText('Change range'), 'worktree')
    await waitFor(() =>
      expect(api.changes).toHaveBeenLastCalledWith('/repos/jetlog', { mode: 'worktree' })
    )
  })

  it('refetches when r is pressed', async () => {
    render(<App />)
    await screen.findByText('a.js')
    const before = api.changes.mock.calls.length
    await userEvent.keyboard('r')
    await waitFor(() => expect(api.changes.mock.calls.length).toBeGreaterThan(before))
  })

  it('moves to the next file when j is pressed', async () => {
    render(<App />)
    await screen.findByText('a.js')
    await userEvent.keyboard('j')
    await waitFor(() =>
      expect(api.file).toHaveBeenLastCalledWith('/repos/jetlog', 'src/b.js', { mode: 'auto' })
    )
  })

  it('persists a theme toggle', async () => {
    render(<App />)
    await screen.findByText('jetlog')
    await userEvent.click(screen.getByLabelText('Switch to light theme'))
    await waitFor(() => expect(api.saveState).toHaveBeenCalledWith({ theme: 'light' }))
  })

  it('opens the picker when there is no initial project', async () => {
    api.initial.mockResolvedValue({ path: null })
    render(<App />)
    expect(await screen.findByText('Select project')).toBeInTheDocument()
  })

  it('passes the loaded config tint values through to FileView', async () => {
    render(<App />)
    await screen.findByText('a.js')
    await waitFor(() =>
      expect(screen.getByTestId('file-view-stub').dataset.tint).toBe(
        JSON.stringify({ added: 70, unchanged: 14, deleted: 40 })
      )
    )
  })

  it('falls back to sensible tint defaults when the config omits the tint block', async () => {
    api.config.mockResolvedValue({ ...CONFIG, tint: undefined })
    render(<App />)
    await screen.findByText('a.js')
    await waitFor(() =>
      expect(screen.getByTestId('file-view-stub').dataset.tint).toBe(
        JSON.stringify({ added: 45, unchanged: 14, deleted: 40 })
      )
    )
  })

  it('shows an error when loading the project fails', async () => {
    api.project.mockRejectedValue(new Error('Not a git repository: /repos/jetlog'))
    render(<App />)
    expect(await screen.findByText('Not a git repository: /repos/jetlog')).toBeInTheDocument()
  })

  it('keeps a non-first file selected when r is pressed', async () => {
    render(<App />)
    await userEvent.click(await screen.findByText('b.js'))
    await waitFor(() =>
      expect(api.file).toHaveBeenLastCalledWith('/repos/jetlog', 'src/b.js', { mode: 'auto' })
    )

    await userEvent.keyboard('r')

    await waitFor(() => expect(api.changes).toHaveBeenCalledTimes(2))
    await waitFor(() =>
      expect(api.file).toHaveBeenLastCalledWith('/repos/jetlog', 'src/b.js', { mode: 'auto' })
    )
  })

  it('falls back to the first file when r is pressed after the selected file vanished', async () => {
    render(<App />)
    await userEvent.click(await screen.findByText('b.js'))
    await waitFor(() =>
      expect(api.file).toHaveBeenLastCalledWith('/repos/jetlog', 'src/b.js', { mode: 'auto' })
    )

    api.changes.mockResolvedValue({
      ...CHANGES,
      files: [{ path: 'src/a.js', oldPath: null, status: 'M', added: 2, removed: 1, binary: false }]
    })

    await userEvent.keyboard('r')

    await waitFor(() =>
      expect(api.file).toHaveBeenLastCalledWith('/repos/jetlog', 'src/a.js', { mode: 'auto' })
    )
  })

  it('lands on the first file when a range change produces a different file set', async () => {
    render(<App />)
    await screen.findByText('a.js')
    await userEvent.click(await screen.findByText('b.js'))
    await waitFor(() =>
      expect(api.file).toHaveBeenLastCalledWith('/repos/jetlog', 'src/b.js', { mode: 'auto' })
    )

    api.changes.mockResolvedValue({
      ...CHANGES,
      files: [{ path: 'src/c.js', oldPath: null, status: 'A', added: 3, removed: 0, binary: false }]
    })

    await userEvent.selectOptions(screen.getByLabelText('Change range'), 'worktree')

    await waitFor(() =>
      expect(api.file).toHaveBeenLastCalledWith('/repos/jetlog', 'src/c.js', { mode: 'worktree' })
    )
  })

  it('clears the first project from the DOM when opening a second project fails', async () => {
    render(<App />)
    expect(await screen.findByText('jetlog')).toBeInTheDocument()
    expect(await screen.findByText('a.js')).toBeInTheDocument()

    api.project.mockRejectedValue(new Error('Not a git repository: /repos/other'))
    await userEvent.click(screen.getByLabelText('Switch project'))
    await userEvent.type(screen.getByLabelText('Project path'), '/repos/other')
    await userEvent.click(screen.getByLabelText('Project path'))
    await userEvent.keyboard('{Enter}')

    expect(await screen.findByText('Not a git repository: /repos/other')).toBeInTheDocument()
    expect(screen.queryByText('a.js')).not.toBeInTheDocument()
    expect(screen.queryByText('jetlog')).not.toBeInTheDocument()
  })
})
