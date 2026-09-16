import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useKeyboard } from './useKeyboard.js'

function Harness({ handlers }) {
  useKeyboard(handlers)
  return <input aria-label="field" />
}

describe('useKeyboard', () => {
  it('calls the handler for a bare key', async () => {
    const r = vi.fn()
    render(<Harness handlers={{ r }} />)
    await userEvent.keyboard('r')
    expect(r).toHaveBeenCalled()
  })

  it('ignores keys with no handler', async () => {
    const r = vi.fn()
    render(<Harness handlers={{ r }} />)
    await userEvent.keyboard('q')
    expect(r).not.toHaveBeenCalled()
  })

  it('ignores keys typed into an input', async () => {
    const r = vi.fn()
    render(<Harness handlers={{ r }} />)
    await userEvent.type(screen.getByLabelText('field'), 'r')
    expect(r).not.toHaveBeenCalled()
  })

  it('ignores modified keys', async () => {
    const r = vi.fn()
    render(<Harness handlers={{ r }} />)
    await userEvent.keyboard('{Meta>}r{/Meta}')
    expect(r).not.toHaveBeenCalled()
  })
})
