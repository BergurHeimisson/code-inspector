import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Header from './Header.jsx'

const project = { root: '/repos/jetlog', name: 'jetlog', branch: 'main', label: 'vs origin/main' }

let rerender

const setup = (overrides = {}) => {
  const props = {
    project,
    range: { mode: 'auto' },
    theme: 'dark',
    scheme: 'amber',
    schemes: ['amber', 'magenta', 'safe'],
    onRangeChange: vi.fn(),
    onRefresh: vi.fn(),
    onSwitchProject: vi.fn(),
    onToggleTheme: vi.fn(),
    onSchemeChange: vi.fn(),
    ...overrides
  }
  ;({ rerender } = render(<Header {...props} />))
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

  it('clamps a negative commit count to 1', async () => {
    const props = setup({ range: { mode: 'commits', n: 3 } })
    const input = screen.getByLabelText('Number of commits')
    await userEvent.clear(input)
    await userEvent.type(input, '-5')
    expect(props.onRangeChange).toHaveBeenLastCalledWith({ mode: 'commits', n: 1 })
  })

  it('clamps a decimal commit count to an integer', async () => {
    const props = setup({ range: { mode: 'commits', n: 3 } })
    const input = screen.getByLabelText('Number of commits')
    await userEvent.clear(input)
    await userEvent.type(input, '2.5')
    expect(props.onRangeChange).toHaveBeenLastCalledWith({ mode: 'commits', n: 2 })
  })

  it('clamps an empty commit count to 1', async () => {
    const props = setup({ range: { mode: 'commits', n: 3 } })
    const input = screen.getByLabelText('Number of commits')
    await userEvent.clear(input)
    expect(props.onRangeChange).toHaveBeenLastCalledWith({ mode: 'commits', n: 1 })
  })

  it('clamps a zero commit count to 1', async () => {
    const props = setup({ range: { mode: 'commits', n: 3 } })
    const input = screen.getByLabelText('Number of commits')
    await userEvent.clear(input)
    await userEvent.type(input, '0')
    expect(props.onRangeChange).toHaveBeenLastCalledWith({ mode: 'commits', n: 1 })
  })

  it('clamps a non-numeric commit count to 1', async () => {
    const props = setup({ range: { mode: 'commits', n: 3 } })
    const input = screen.getByLabelText('Number of commits')
    await userEvent.clear(input)
    await userEvent.type(input, 'abc')
    expect(props.onRangeChange).toHaveBeenLastCalledWith({ mode: 'commits', n: 1 })
  })

  it('resyncs the commits input display when the n prop changes externally', () => {
    const props = setup({ range: { mode: 'commits', n: 3 } })
    const input = screen.getByLabelText('Number of commits')
    expect(input).toHaveValue(3)
    rerender(<Header {...props} range={{ mode: 'commits', n: 7 }} />)
    expect(screen.getByLabelText('Number of commits')).toHaveValue(7)
  })

  it('resyncs the ref input display when the ref prop changes externally', () => {
    const props = setup({ range: { mode: 'ref', ref: 'main' } })
    const input = screen.getByLabelText('Base ref')
    expect(input).toHaveValue('main')
    rerender(<Header {...props} range={{ mode: 'ref', ref: 'develop' }} />)
    expect(screen.getByLabelText('Base ref')).toHaveValue('develop')
  })

  it('lists the scheme keys from config, not a hardcoded set', () => {
    setup({ schemes: ['amber', 'custom-fourth'] })
    const select = screen.getByLabelText('Colour scheme')
    expect(within(select).getAllByRole('option').map((o) => o.value)).toEqual([
      'amber',
      'custom-fourth'
    ])
  })

  it('emits a scheme change', async () => {
    const props = setup()
    await userEvent.selectOptions(screen.getByLabelText('Colour scheme'), 'magenta')
    expect(props.onSchemeChange).toHaveBeenCalledWith('magenta')
  })

  it('seeds n: 1 when switching into commits mode', async () => {
    const props = setup({ range: { mode: 'auto' } })
    await userEvent.selectOptions(screen.getByLabelText('Change range'), 'commits')
    expect(props.onRangeChange).toHaveBeenLastCalledWith({ mode: 'commits', n: 1 })
  })

  it("seeds ref: '' when switching into ref mode", async () => {
    const props = setup({ range: { mode: 'auto' } })
    await userEvent.selectOptions(screen.getByLabelText('Change range'), 'ref')
    expect(props.onRangeChange).toHaveBeenLastCalledWith({ mode: 'ref', ref: '' })
  })
})
