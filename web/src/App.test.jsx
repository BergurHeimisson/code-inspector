import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import App from './App.jsx'

describe('App', () => {
  it('renders the application name', () => {
    render(<App />)
    expect(screen.getByText('code-inspector')).toBeInTheDocument()
  })
})
