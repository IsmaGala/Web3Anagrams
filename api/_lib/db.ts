// Neon Postgres client — a tagged template `sql` for every endpoint.
// Lazy-initialized so importing this file has no side-effects until the
// first query (helps cold-start perf and lets the file be type-checked
// even without DATABASE_URL set locally).

import { neon } from '@neondatabase/serverless'

let _sql: ReturnType<typeof neon> | null = null

export function sql() {
  if (_sql) return _sql
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set — add it in Vercel Project Settings → Environment Variables')
  _sql = neon(url)
  return _sql
}
