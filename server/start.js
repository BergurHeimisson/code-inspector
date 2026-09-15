#!/usr/bin/env node
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import open from 'open'
import { createApp } from './app.js'
import { initialProject, tailnetUrl } from './launch.js'

const here = dirname(fileURLToPath(import.meta.url))
const argv = process.argv.slice(2)
const dev = argv.includes('--dev')
const shouldOpen = !argv.includes('--no-open') && !dev

process.env.CODE_INSPECTOR_CWD = process.cwd()

const app = createApp({ distDir: dev ? null : join(here, '..', 'web', 'dist') })
const port = dev ? 5174 : 0

const server = app.listen(port, '127.0.0.1', async () => {
  const actualPort = server.address().port
  const local = `http://127.0.0.1:${actualPort}`
  const project = await initialProject(process.cwd())

  console.log(`code-inspector  ${local}`)
  const tailnet = await tailnetUrl(actualPort)
  if (tailnet) console.log(`                ${tailnet}`)
  console.log(project ? `project         ${project}` : 'project         none — pick one in the UI')

  if (shouldOpen) await open(local)
})
