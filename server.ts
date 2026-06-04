// ─────────────────────────────────────────────────────────────────────────────
// server.ts — Express entry point for DigitalOcean App Platform.
//
// Replaces Vercel's serverless function routing. In production this process:
//   1. Mounts every api/* handler under /api/*
//   2. Serves the Vite-built frontend from dist/ for all other routes
//
// DO App Platform injects PORT automatically; we fall back to 8080 which is
// also what DO expects as the default HTTP port.
// ─────────────────────────────────────────────────────────────────────────────

import express, { type Request, type Response } from 'express'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { createRequire } from 'module'

// ── API handlers ──────────────────────────────────────────────────────────────
import healthHandler        from './api/health.js'
import profileHandler       from './api/profile.js'
import authHandler          from './api/auth/handler.js'
import discordAuthHandler   from './api/auth/discord.js'
import adminHandler         from './api/admin/handler.js'
import adminAnalyticsHandler from './api/admin/analytics.js'
import analyticsHandler     from './api/analytics/handler.js'
import economySpendHandler  from './api/economy/spend.js'
import leaderboardHandler   from './api/leaderboard/handler.js'
import leaderboardScore     from './api/leaderboard/score.js'
import playHint             from './api/play/level/hint.js'
import playStart            from './api/play/level/start.js'
import playSubmitWord       from './api/play/level/submit-word.js'
import storePurchase        from './api/store/purchase.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = parseInt(process.env.PORT ?? '8080', 10)

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// ── API routes ────────────────────────────────────────────────────────────────
// Note: order matters — specific routes before param routes.

app.all('/api/health',                (req, res) => healthHandler(req as any, res as any))
app.all('/api/profile',               (req, res) => profileHandler(req as any, res as any))
app.all('/api/auth/discord',          (req, res) => discordAuthHandler(req as any, res as any))
app.all('/api/auth/:action',          (req, res) => authHandler(req as any, res as any))
app.all('/api/admin/analytics/:action',(req, res) => adminAnalyticsHandler(req as any, res as any))
app.all('/api/admin/:action',         (req, res) => adminHandler(req as any, res as any))
app.all('/api/analytics/*',           (req, res) => analyticsHandler(req as any, res as any))
app.all('/api/economy/spend',         (req, res) => economySpendHandler(req as any, res as any))
app.all('/api/leaderboard/score',     (req, res) => leaderboardScore(req as any, res as any))
app.all('/api/leaderboard/:event',    (req, res) => leaderboardHandler(req as any, res as any))
app.all('/api/play/level/hint',       (req, res) => playHint(req as any, res as any))
app.all('/api/play/level/start',      (req, res) => playStart(req as any, res as any))
app.all('/api/play/level/submit-word',(req, res) => playSubmitWord(req as any, res as any))
app.all('/api/store/purchase',        (req, res) => storePurchase(req as any, res as any))

// Catch-all for unknown /api/* routes
app.all('/api/*', (_req, res) => {
  res.status(404).json({ error: 'API route not found' })
})

// ── Frontend (production) ─────────────────────────────────────────────────────
// In development, Vite dev server handles the frontend.
// In production (DO), Express serves the built dist/.
if (process.env.NODE_ENV === 'production') {
  // server.js is bundled into dist/, so static assets are in the same dir (__dirname)
  app.use(express.static(__dirname))
  // Serve the CM admin panel for /admin (and /admin/*) — all other routes get the game SPA.
  app.get('/admin', (_req: Request, res: Response) => {
    res.sendFile(join(__dirname, 'admin.html'))
  })
  app.get('*', (_req: Request, res: Response) => {
    res.sendFile(join(__dirname, 'index.html'))
  })
}

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[server] listening on port ${PORT} (${process.env.NODE_ENV ?? 'development'})`)
})

export default app
