# Update the cream theme, then merge into main

The changes are saved on `feature/freeform-responsive-puzzles`. Main is left for you to merge and push.

## Preserve your laptop edits first

Stop Vite with Ctrl+C. Open PowerShell in `PuzzleTogether-git`, then inspect:

```powershell
git status
git diff
```

If you edited `src/pages/About.tsx`, save the file in your editor and commit it:

```powershell
git add src/pages/About.tsx
git commit -m "Update About page"
```

Skip that commit if the file is unchanged. If you intentionally edited other files, review and commit those too. `.env.local` and other private `.env.*` files stay ignored; do not force-add them. Never use a reset or overwrite to get around an unexpected conflict.

## Get the latest work and push main

Run each command from the project directory. Stop and resolve any reported conflict or failed build before continuing.

```powershell
git switch feature/freeform-responsive-puzzles
git pull --rebase origin feature/freeform-responsive-puzzles
git switch main
git pull --ff-only origin main
git merge feature/freeform-responsive-puzzles
npm ci
npm run build
git push origin main
npm run dev
```

The feature-branch pull rebases your saved local commits onto the updates from GitHub. If a conflict appears, Git pauses with your commits retained; resolve it before continuing.

The merge includes the responsive/freeform puzzle changes plus the cream palette and security updates. Use Node.js 24 LTS; the updated tools support Node 22.13+, 24.x, and 26+. Your untracked `.env.local` stays in this checkout when switching branches. No SQL migration was changed in this polish update; both existing migrations are still required for a fresh Supabase project.

If GitHub requires pull requests for `main`, push the feature branch and open a pull request instead of bypassing branch protection.

## Why About.tsx changes might not appear

`src/pages/About.tsx` renders the `/about` route. The homepage `/` renders `src/pages/Home.tsx`. Use the footer's **About this little place** link to open About before expecting edits to appear.

Also check the project folder. This session created two possible laptop copies:

- `PuzzleTogether-main` — the original ZIP download.
- `PuzzleTogether-git` — the Git clone.

If PowerShell is running Vite in `PuzzleTogether-git`, edit `PuzzleTogether-git/src/pages/About.tsx`. Editing the old ZIP copy does not update the cloned project. Run `Get-Location` in PowerShell to check the active directory and open that same directory in VS Code. Save with Ctrl+S. Use the exact Local address Vite prints, since a second server may have chosen another port.

Saving About.tsx was verified to update `/about` through Vite hot reload without restarting. If you use `npm run preview`, rebuild with `npm run build` to see edits; preview serves the built `dist` files. Changes to `.env.local` always require restarting `npm run dev`.
