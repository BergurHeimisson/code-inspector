#!/usr/bin/env node
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import open from 'open'
import { createApp } from './app.js'
import { initialProject, tailnetAddress } from './launch.js'
import { listenOn } from './listen.js'
import { parseOptions } from './options.js'

const here = dirname(fileURLToPath(import.meta.url))
const { dev, tailnet, port, shouldOpen } = parseOptions(process.argv.slice(2))

process.env.CODE_INSPECTOR_CWD = process.cwd()

const app = createApp({ distDir: dev ? null : join(here, '..', 'web', 'dist') })

// Loopback is always bound. --tailnet adds a second socket on the Tailscale
// address itself rather than switching to 0.0.0.0, so sharing the review over
// the tailnet never also exposes the port to whatever network you are on.
const address = tailnet ? await tailnetAddress() : null
if (tailnet && !address) {
  console.error('code-inspector: --tailnet given, but Tailscale is not running; staying on 127.0.0.1')
}

let server
try {
  server = await listenOn(app, '127.0.0.1', port)
} catch (error) {
  const reason = error.code === 'EADDRINUSE' ? `port ${port} is already in use` : error.message
  console.error(`code-inspector: ${reason}`)
  process.exit(1)
}

const actualPort = server.address().port
const local = `http://127.0.0.1:${actualPort}`

console.log(`code-inspector  ${local}`)

if (address) {
  try {
    await listenOn(app, address, actualPort)
    console.log(`                http://${address}:${actualPort}`)
  } catch (error) {
    console.error(`code-inspector: could not bind ${address}: ${error.message}`)
  }
}

const project = await initialProject(process.cwd())
console.log(project ? `project         ${project}` : 'project         none — pick one in the UI')

if (shouldOpen) await open(local)
