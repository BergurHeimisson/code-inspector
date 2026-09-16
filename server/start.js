#!/usr/bin/env node
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import open from 'open'
import { createApp } from './app.js'
import { initialProject, tailnetUrl } from './launch.js'
import { parseOptions } from './options.js'

const here = dirname(fileURLToPath(import.meta.url))
const { dev, tailnet, host, port, shouldOpen } = parseOptions(process.argv.slice(2))

process.env.CODE_INSPECTOR_CWD = process.cwd()

const app = createApp({ distDir: dev ? null : join(here, '..', 'web', 'dist') })

const server = app.listen(port, host, async () => {
  const actualPort = server.address().port
  const local = `http://127.0.0.1:${actualPort}`
  const project = await initialProject(process.cwd())

  console.log(`code-inspector  ${local}`)
  if (tailnet) {
    const url = await tailnetUrl(actualPort)
    console.log(url ? `                ${url}` : '                tailnet requested, but Tailscale is not running')
  }
  console.log(project ? `project         ${project}` : 'project         none — pick one in the UI')

  if (shouldOpen) await open(local)
})

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`code-inspector: port ${port} is already in use`)
  } else {
    console.error(`code-inspector: ${error.message}`)
  }
  process.exit(1)
})
