#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// scripts/migrate.mjs — run all migrations against any PostgreSQL database
//
// Usage:
//   node scripts/migrate.mjs
//
// Reads DATABASE_URL from the environment (or .env.local via --env-file flag).
// Safe to run multiple times — all DDL uses IF NOT EXISTS.
//
// Example (PowerShell):
//   $env:DATABASE_URL="postgresql://..." ; node scripts/migrate.mjs
// ─────────────────────────────────────────────────────────────────────────────

import postgres from 'postgres'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const url = process.env.DATABASE_URL
if (!url) {
  console.error('ERROR: DATABASE_URL environment variable is not set.')
  console.error('')
  console.error('PowerShell:')
  console.error('  $env:DATABASE_URL="postgresql://..." ; node scripts/migrate.mjs')
  process.exit(1)
}

const migrations = [
  '0001_init.sql',
  '0002_player_state.sql',
  '0003_play_rounds.sql',
  '0004_balance_transactions.sql',
  '0005_analytics_events.sql',
]

const db = postgres(url, { ssl: 'require', max: 1 })

try {
  for (const file of migrations) {
    const sqlText = readFileSync(join(__dirname, '..', 'migrations', file), 'utf8')
    console.log(`▶ Running ${file} ...`)
    await db.unsafe(sqlText)
    console.log(`  ✓ done`)
  }
  console.log('')
  console.log('All migrations applied successfully.')
} catch (err) {
  console.error('Migration failed:', err.message)
  process.exit(1)
} finally {
  await db.end()
}
