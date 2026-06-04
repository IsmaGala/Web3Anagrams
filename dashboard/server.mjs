// WordChain Analytics Dashboard — Express server
//
// Serves the static dashboard HTML and proxies /api/analytics/* to the
// WordChain Vercel deployment so the browser never hits CORS.
//
// Usage:
//   WORDCHAIN_API_URL=https://your-vercel-deployment.vercel.app node server.mjs
//
// Deploy:
//   gcloud run deploy wordchain-dashboard --source . --region us-east1 --allow-unauthenticated --port 8080
//
// Following the architecture from galachainbootstrap.replit.app/DATA-PIPELINE.md

import express from 'express'
import { createProxyMiddleware } from 'http-proxy-middleware'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PORT      = process.env.PORT || 8080

// The WordChain deployment URL — analytics read endpoints live here.
const UPSTREAM     = process.env.WORDCHAIN_API_URL || 'https://your-wordchain-deployment.vercel.app'
const ADMIN_SECRET = process.env.ADMIN_SECRET || ''

const app = express()

// ── Health check (Cloud Run liveness probe) ──────────────────────────────────
app.get('/health', (_req, res) => res.json({ ok: true, upstream: UPSTREAM }))

// ── Proxy /api/analytics/* → WordChain deployment ────────────────────────────
// app.use strips the mount prefix before http-proxy-middleware sees the path,
// so we use pathRewrite to restore /api/analytics before forwarding.
app.use('/api/analytics', createProxyMiddleware({
  target:       UPSTREAM,
  changeOrigin: true,
  pathRewrite:  (path) => '/api/analytics' + path,
  on: {
    proxyReq: (proxyReq) => {
      if (ADMIN_SECRET) proxyReq.setHeader('x-admin-secret', ADMIN_SECRET)
    },
    error: (err, _req, res) => {
      console.error('[proxy] error:', err.message)
      res.status(502).json({ error: 'Upstream unavailable', detail: err.message })
    },
  },
}))

// ── Serve the dashboard HTML ──────────────────────────────────────────────────
app.use(express.static(__dirname))
app.get('*', (_req, res) => res.sendFile(join(__dirname, 'index.html')))

app.listen(PORT, () => {
  console.log(`WordChain dashboard → http://localhost:${PORT}`)
  console.log(`Proxying /api/analytics/* → ${UPSTREAM}`)
})
