# Push current state to git@github.com:IsmaGala/Web3Anagrams.git
# Run from: C:\Users\Isuma\Repositories\WordChain\nft-wordchain
# Requires: git installed, SSH key registered on GitHub.

# 1) Wipe any partial .git/ left over from sandbox attempts
if (Test-Path .git) {
    Write-Host "Removing partial .git directory..."
    # Files inside .git may be read-only; clear that bit first
    Get-ChildItem -Path .git -Recurse -Force | ForEach-Object { $_.IsReadOnly = $false }
    Remove-Item -Path .git -Recurse -Force
}

# 2) Init fresh, on a 'main' branch
git init -b main
git config user.name "IsmaGala"
git config user.email "isaavedra@gala.games"

# 3) Wire up the remote
git remote add origin git@github.com:IsmaGala/Web3Anagrams.git

# 4) Stage everything respecting .gitignore (node_modules, dist already excluded)
git add .

# 5) Confirm what's about to be committed
Write-Host ""
Write-Host "=== Files being committed ==="
git diff --cached --stat
Write-Host ""

# 6) First commit
$commitMsg = @"
Initial commit: NFT WordChain v1.0

Game features:
- 4 free worlds (Town Star, Mirandus, Galaswap, Eternal Night) + 3 premium
  worlds (Area 51, Asimov Robotics, Peaks & Trails) gated by GALA cost
- Per-level word-count ramp (10 -> 20) with theme-length crescendo per world
- Daily challenge mode with 5-minute timer, hint-only reward (no GALA leak),
  forfeit confirmation popup
- Hint economy and shop, 3 starting hints + 5 per daily win
- ZzFX-powered SFX engine with 12 tuned voices, mute toggle persisted to
  localStorage
- Dev-only debug menu (gated by import.meta.env.DEV) with nav shortcuts,
  GALA/hints controls, progress unlock/reset, premium grants
- Progress and premium-unlock state persisted across reloads
- TypeScript + Vite + React + Zustand + Tailwind
"@

git commit -m $commitMsg

# 7) Push. NOTE: if the remote already has commits (README from GitHub init),
#    you'll either need to (a) pull first or (b) force-push. Force is the
#    fastest path when you know the local state is the source of truth.
Write-Host ""
Write-Host "=== Pushing... ==="
Write-Host "If the remote has an existing initial commit, this will fail."
Write-Host "In that case, re-run with:  git push -u origin main --force"
Write-Host ""
git push -u origin main

Write-Host ""
Write-Host "Done. Check https://github.com/IsmaGala/Web3Anagrams"
