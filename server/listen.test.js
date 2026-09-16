import { describe, it, expect, afterEach } from 'vitest'
import express from 'express'
import { listenOn } from './listen.js'

let opened = []

afterEach(async () => {
  for (const server of opened) await new Promise((resolve) => server.close(resolve))
  opened = []
})

const app = () => express().get('/', (req, res) => res.send('ok'))

describe('listenOn', () => {
  it('resolves with a listening server', async () => {
    const server = await listenOn(app(), '127.0.0.1', 0)
    opened.push(server)
    expect(server.address().address).toBe('127.0.0.1')
    expect(server.address().port).toBeGreaterThan(0)
  })

  it('rejects when the address is already taken', async () => {
    const first = await listenOn(app(), '127.0.0.1', 0)
    opened.push(first)
    await expect(listenOn(app(), '127.0.0.1', first.address().port)).rejects.toMatchObject({
      code: 'EADDRINUSE'
    })
  })

  it('rejects rather than hanging when the address is not local', async () => {
    await expect(listenOn(app(), '203.0.113.1', 0)).rejects.toMatchObject({ code: 'EADDRNOTAVAIL' })
  })
})
