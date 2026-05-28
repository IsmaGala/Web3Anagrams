// Postgres client — a tagged template `sql` for every endpoint.
// Uses postgres.js (works with DO Managed PostgreSQL and any standard PG URL).
// Lazy-initialized so importing this file has no side-effects until the
// first query (helps cold-start perf and lets the file be type-checked
// even without DATABASE_URL set locally).

import postgres from 'postgres'

let _sql: ReturnType<typeof postgres> | null = null

export function sql() {
  if (_sql) return _sql
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set — add it in DO App Platform → Settings → Environment Variables')
  _sql = postgres(url, { ssl: 'require', max: 10 })
  return _sql
}
