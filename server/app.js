import express from 'express'
import { apiRouter } from './routes/api.js'

function statusFor(error) {
  if (error.status) return error.status
  if (error.code === 'EOUTSIDEHOME') return 403
  return 500
}

export function createApp({ distDir = null } = {}) {
  const app = express()
  app.use(express.json())
  app.use('/api', apiRouter())

  app.use('/api', (error, req, res, next) => {
    res.status(statusFor(error)).json({ error: error.message })
  })

  if (distDir) {
    app.use(express.static(distDir))
    app.get('/{*splat}', (req, res) => res.sendFile('index.html', { root: distDir }))
  }

  return app
}
