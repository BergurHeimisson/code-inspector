import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Header from './Header.jsx'

const project = { root: '/repos/jetlog', name: 'jetlog', branch: 'main', label: 'vs origin/main' }

const setup = (overrides = {}) => {
  const props = {
    project,
    range: { mode: 'auto' },
    theme: 'dark',
    onRangeChange: vi.fn(),
    onRefresh: vi.fn(),
    onSwitchProject: vi.fn(),
    onToggleTheme: vi.fn(),
    ...overrides
  }
  render(<Header {...props} />)
  return props
}

describe('Header', () => {
  it('shows the project name, branch and base label', () => {
    setup()
    expect(screen.getByText('jetlog')).toBeInTheDocument()
    expect(screen.getByText('main')).toBeInTheDocument()
    expect(screen.getByText('vs origin/main')).toBeInTheDocument()
  })

  it('shows a placeholder with no project', () => {
    setup({ project: null })
    expect(screen.getByText('No project')).toBeInTheDocument()
  })

  it('refreshes when the refresh button is pressed', async () => {
    const props = setup()
    await userEvent.click(screen.getByLabelText('Refresh'))
    expect(props.onRefresh).toHaveBeenCalled()
  })

  it('switches project when the switch button is pressed', async () => {
    const props = setup()
    await userEvent.click(screen.getByLabelText('Switch project'))
    expect(props.onSwitchProject).toHaveBeenCalled()
  })

  it('toggles the theme', async () => {
    const props = setup()
    await userEvent.click(screen.getByLabelText('Switch to light theme'))
    expect(props.onToggleTheme).toHaveBeenCalled()
  })

  it('labels the toggle for the other direction in light mode', () => {
    setup({ theme: 'light' })
    expect(screen.getByLabelText('Switch to dark theme')).toBeInTheDocument()
  })

  it('emits a worktree range', async () => {
    const props = setup()
    await userEvent.selectOptions(screen.getByLabelText('Change range'), 'worktree')
    expect(props.onRangeChange).toHaveBeenCalledWith({ mode: 'worktree' })
  })

  it('emits a commit-count range from the revealed input', async () => {
    const props = setup({ range: { mode: 'commits', n: 3 } })
    const input = screen.getByLabelText('Number of commits')
    await userEvent.clear(input)
    await userEvent.type(input, '5')
    expect(props.onRangeChange).toHaveBeenLastCalledWith({ mode: 'commits', n: 5 })
  })

  it('emits a ref range from the revealed input', async () => {
    const props = setup({ range: { mode: 'ref', ref: '' } })
    await userEvent.type(screen.getByLabelText('Base ref'), 'develop')
    expect(props.onRangeChange).toHaveBeenLastCalledWith({ mode: 'ref', ref: 'develop' })
  })
})
