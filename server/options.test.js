import { describe, it, expect } from 'vitest'
import { parseOptions } from './options.js'

describe('parseOptions', () => {
  it('defaults to loopback with no tailnet line', () => {
    expect(parseOptions([])).toMatchObject({ host: '127.0.0.1', tailnet: false })
  })

  it('binds every interface when --tailnet is given', () => {
    expect(parseOptions(['--tailnet'])).toMatchObject({ host: '0.0.0.0', tailnet: true })
  })

  it('opens the browser unless --no-open or --dev is given', () => {
    expect(parseOptions([]).shouldOpen).toBe(true)
    expect(parseOptions(['--no-open']).shouldOpen).toBe(false)
    expect(parseOptions(['--dev']).shouldOpen).toBe(false)
  })

  it('uses the fixed dev port and a free port otherwise', () => {
    expect(parseOptions(['--dev'])).toMatchObject({ dev: true, port: 5174 })
    expect(parseOptions([])).toMatchObject({ dev: false, port: 0 })
  })

  it('serves the tailnet from the dev server too', () => {
    expect(parseOptions(['--dev', '--tailnet'])).toMatchObject({ host: '0.0.0.0', port: 5174 })
  })
})
