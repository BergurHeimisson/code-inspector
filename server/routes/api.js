import { Router } from 'express'
import { basename } from 'node:path'
import { gitTry } from '../git/run.js'
import { resolveBase } from '../git/base.js'
import { changedFiles } from '../git/changes.js'
import { fileLines } from '../git/file.js'
import { listDirectory } from '../browse.js'
import { loadConfig } from '../config.js'
import { loadState, saveState, rememberProject } from '../state.js'

export function parseRange(value) {
  if (!value || value === 'auto') return { mode: 'auto' }
  if (value === 'worktree') return { mode: 'worktree' }

  if (value.startsWith('commits:')) {
    const n = Number(value.slice('commits:'.length))
    if (!Number.isInteger(n) || n < 1) throw badRequest(`Invalid commit count in range: ${value}`)
    return { mode: 'commits', n }
  }

  if (value.startsWith('ref:')) {
    const ref = value.slice('ref:'.length)
    if (ref === '') throw badRequest('Empty ref in range')
    return { mode: 'ref', ref }
  }

  throw badRequest(`Unrecognised range: ${value}`)
}

function badRequest(message) {
  const error = new Error(message)
  error.status = 400
  return error
}

async function repoRoot(rawPath) {
  if (!rawPath) throw badRequest('Missing path parameter')
  const root = await gitTry(rawPath, ['rev-parse', '--show-toplevel'])
  if (!root) {
    const error = new Error(`Not a git repository: ${rawPath}`)
    error.status = 404
    throw error
  }
  return root
}

export function apiRouter() {
  const router = Router()

  router.get('/project', async (req, res, next) => {
    try {
      const root = await repoRoot(req.query.path)
      const branch = (await gitTry(root, ['rev-parse', '--abbrev-ref', 'HEAD'])) ?? 'HEAD'
      const { base, label } = await resolveBase(root, parseRange(req.query.range))
      res.json({ root, name: basename(root), branch, base, label })
    } catch (error) {
      next(error)
    }
  })

  router.get('/changes', async (req, res, next) => {
    try {
      const root = await repoRoot(req.query.path)
      const { base, label } = await resolveBase(root, parseRange(req.query.range))
      res.json({ root, base, label, files: await changedFiles(root, base) })
    } catch (error) {
      next(error)
    }
  })

  router.get('/file', async (req, res, next) => {
    try {
      const root = await repoRoot(req.query.path)
      if (!req.query.file) throw badRequest('Missing file parameter')
      const { base } = await resolveBase(root, parseRange(req.query.range))
      const { maxFileBytes } = await loadConfig()
      res.json(await fileLines(root, base, req.query.file, { maxFileBytes }))
    } catch (error) {
      next(error)
    }
  })

  router.get('/fs/list', async (req, res, next) => {
    try {
      if (!req.query.path) throw badRequest('Missing path parameter')
      res.json(await listDirectory(req.query.path))
    } catch (error) {
      next(error)
    }
  })

  router.get('/config', async (req, res, next) => {
    try {
      res.json(await loadConfig())
    } catch (error) {
      next(error)
    }
  })

  router.get('/state', async (req, res, next) => {
    try {
      res.json(await loadState())
    } catch (error) {
      next(error)
    }
  })

  router.put('/state', async (req, res, next) => {
    try {
      res.json(await saveState(req.body ?? {}))
    } catch (error) {
      next(error)
    }
  })

  router.post('/state/project', async (req, res, next) => {
    try {
      if (!req.body?.path) throw badRequest('Missing path in body')
      res.json(await rememberProject(req.body.path))
    } catch (error) {
      next(error)
    }
  })

  return router
}
