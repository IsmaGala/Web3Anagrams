// Smoke-test endpoint — proves the Vercel serverless side of the project
// is wired up correctly. Reachable at `/api/health` once deployed.
//
// Example response:
//   { "ok": true, "time": "2026-05-13T19:42:31.812Z", "env": "production" }
//
// This file deliberately has no dependencies — Vercel just compiles the
// .ts file with its default Node runtime and exposes the default export
// as the handler.

import type { VercelRequest, VercelResponse } from './_lib/vercel-compat.js'

export default function handler(req: VercelRequest, res: VercelResponse) {
  // Block anything other than GET/HEAD so this can't be abused as a CORS probe.
  if (req.method && req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  return res.status(200).json({
    ok:   true,
    time: new Date().toISOString(),
    env:  process.env.VERCEL_ENV ?? 'unknown',
  })
}
