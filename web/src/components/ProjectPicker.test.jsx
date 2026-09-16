import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ProjectPicker from './ProjectPicker.jsx'
import { api } from '../api.js'

vi.mock('../api.js', () => ({
  api: { fsList: vi.fn() }
}))

const listing = {
  path: '/home/me/ai_code',
  parent: '/home/me',
  isGitRepo: false,
  entries: [
    { name: 'jetlog', path: '/home/me/ai_code/jetlog', isGitRepo: true },
    { name: 'notes', path: '/home/me/ai_code/notes', isGitRepo: false }
  ]
}

beforeEach(() => {
  api.fsList.mockReset()
  api.fsList.mockResolvedValue(listing)
})

describe('ProjectPicker', () => {
  it('renders nothing when closed', () => {
    render(<ProjectPicker open={false} recents={[]} onOpen={() => {}} onClose={() => {}} />)
    expect(screen.queryByText('Select project')).not.toBeInTheDocument()
  })

  it('lists recents as one-click buttons', async () => {
    const onOpen = vi.fn()
    render(
      <ProjectPicker
        open
        recents={['/home/me/ai_code/jetlog']}
        onOpen={onOpen}
        onClose={() => {}}
      />
    )
    await userEvent.click(await screen.findByText('/home/me/ai_code/jetlog'))
    expect(onOpen).toHaveBeenCalledWith('/home/me/ai_code/jetlog')
  })

  it('lists directories from the api', async () => {
    render(<ProjectPicker open recents={[]} onOpen={() => {}} onClose={() => {}} />)
    expect(await screen.findByText('jetlog')).toBeInTheDocument()
    expect(screen.getByText('notes')).toBeInTheDocument()
  })

  it('navigates into a directory on click', async () => {
    render(<ProjectPicker open recents={[]} onOpen={() => {}} onClose={() => {}} />)
    await userEvent.click(await screen.findByText('notes'))
    await waitFor(() =>
      expect(api.fsList).toHaveBeenLastCalledWith('/home/me/ai_code/notes')
    )
  })

  it('opens a git repository from its Open button', async () => {
    const onOpen = vi.fn()
    render(<ProjectPicker open recents={[]} onOpen={onOpen} onClose={() => {}} />)
    await userEvent.click(await screen.findByLabelText('Open jetlog'))
    expect(onOpen).toHaveBeenCalledWith('/home/me/ai_code/jetlog')
  })

  it('offers Open only for git repositories', async () => {
    render(<ProjectPicker open recents={[]} onOpen={() => {}} onClose={() => {}} />)
    await screen.findByLabelText('Open jetlog')
    expect(screen.queryByLabelText('Open notes')).not.toBeInTheDocument()
  })

  it('navigates up to the parent', async () => {
    render(<ProjectPicker open recents={[]} onOpen={() => {}} onClose={() => {}} />)
    await userEvent.click(await screen.findByLabelText('Go up'))
    await waitFor(() => expect(api.fsList).toHaveBeenLastCalledWith('/home/me'))
  })

  it('opens a typed path', async () => {
    const onOpen = vi.fn()
    render(<ProjectPicker open recents={[]} onOpen={onOpen} onClose={() => {}} />)
    await userEvent.type(await screen.findByLabelText('Project path'), '/somewhere/else{Enter}')
    expect(onOpen).toHaveBeenCalledWith('/somewhere/else')
  })

  it('surfaces an error from the api', async () => {
    api.fsList.mockRejectedValue(new Error('Path is outside the home directory'))
    render(<ProjectPicker open recents={[]} onOpen={() => {}} onClose={() => {}} />)
    expect(await screen.findByText('Path is outside the home directory')).toBeInTheDocument()
  })

  it('opens the current folder when it is a git repository', async () => {
    api.fsList.mockResolvedValue({ ...listing, isGitRepo: true })
    const onOpen = vi.fn()
    render(<ProjectPicker open recents={[]} onOpen={onOpen} onClose={() => {}} />)
    await userEvent.click(await screen.findByLabelText('Open this folder'))
    expect(onOpen).toHaveBeenCalledWith('/home/me/ai_code')
  })

  it('disables opening the current folder when it is not a git repository', async () => {
    render(<ProjectPicker open recents={[]} onOpen={() => {}} onClose={() => {}} />)
    expect(await screen.findByLabelText('Open this folder')).toBeDisabled()
  })

  it('lets the user select a repository they navigated into, even when none of its children are repositories', async () => {
    // This is the trap: entries has no repos, but the current directory itself is one.
    api.fsList.mockResolvedValue({
      path: '/home/me/ai_code/code-inspector',
      parent: '/home/me/ai_code',
      isGitRepo: true,
      entries: [
        { name: 'bin', path: '/home/me/ai_code/code-inspector/bin', isGitRepo: false },
        { name: 'server', path: '/home/me/ai_code/code-inspector/server', isGitRepo: false }
      ]
    })
    const onOpen = vi.fn()
    render(<ProjectPicker open recents={[]} onOpen={onOpen} onClose={() => {}} />)
    await userEvent.click(await screen.findByText('bin'))
    const openHere = await screen.findByLabelText('Open this folder')
    expect(openHere).toBeEnabled()
    await userEvent.click(openHere)
    expect(onOpen).toHaveBeenCalledWith('/home/me/ai_code/code-inspector')
  })
})
