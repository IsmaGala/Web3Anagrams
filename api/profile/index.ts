// This file is intentionally a no-op. The GET /api/profile endpoint lives
// at api/profile.ts (one level up) — Vercel routes /api/profile to that
// file. We can't physically delete this one from the sandbox, so we keep
// it without a default export to avoid Vercel registering it as a route.
//
// You can safely `git rm` this file locally:
//
//     git rm api/profile/index.ts
//     git commit -m "Remove stub api/profile/index.ts"
//
// (Or just leave it — it doesn't affect production routing.)

export {}
