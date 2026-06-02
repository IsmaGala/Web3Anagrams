// ─────────────────────────────────────────────────────────────────────────────
// vercel-compat.ts
//
// Type shim so existing handler files can keep their
// `import type { VercelRequest, VercelResponse } from '@vercel/node'`
// unchanged — or switch to this file for the DO migration.
//
// Express Request/Response are structurally compatible with the Vercel types
// (same body, headers, query, method, url, status(), json(), etc.).
// ─────────────────────────────────────────────────────────────────────────────

export type { Request as VercelRequest, Response as VercelResponse } from 'express'
