# Try the responsive, freeform puzzle update

This update is on the separate GitHub branch `feature/freeform-responsive-puzzles`.
The original `main` branch is unchanged.

## If you downloaded the original ZIP (Windows)

1. In the PowerShell window running the old website, press **Ctrl+C** to stop it.
2. Open the [updated branch on GitHub](https://github.com/gerardosison/PuzzleTogether/tree/feature/freeform-responsive-puzzles).
3. Check that the branch selector says **feature/freeform-responsive-puzzles**, then click **Code → Download ZIP**.
4. Extract the new ZIP into a **new folder**. Keep your old folder as a backup. You do not need to replace its files.
5. If you configured Supabase in the old project, copy **only your `.env.local`** into the new folder. Keep this file private. Solo play does not need it.
6. Open PowerShell in the new folder containing `package.json`, then run:

   ```powershell
   npm ci
   npm run dev
   ```

7. Open the Local address printed in PowerShell. Use the same address/port as before to retain the browser's old solo saves. Keep PowerShell open while testing.

If port 5173 is already occupied, stop the older server first. Browser saves belong to the exact browser origin (scheme, hostname, and port), not to the project folder.

## If you cloned with Git instead of downloading a ZIP

Keep any local edits first. In the existing checkout, run:

```sh
git fetch origin
git switch --track origin/feature/freeform-responsive-puzzles
npm ci
npm run dev
```

If you already have this branch locally, switch to it and pull it instead of creating another tracking branch. No Git worktree is needed.

## Test the changes

1. Select an artwork and start an easy or medium solo puzzle.
2. Confirm you can see the full board **and** the current piece tray without scrolling between them.
3. Drag a piece onto a deliberately wrong location. It should stay there without increasing the solved-piece count.
4. Drag it to another location or back to the tray. If you leave it loose on the board, refresh and choose **Continue your puzzle**; it should reappear where you left it.
5. Drag it to its correct location. It should snap, count toward completion, and stop moving.
6. Try a phone/tablet, or resize the browser. The board and tray should fit together; loose pieces retain their relative positions as the layout changes.
7. Browse tray pages, show/hide the reference, and try the optional keyboard/tap controls below the table.

## If you already connected Supabase

Before testing shared rooms with this update, open Supabase **SQL Editor** and run:

`supabase/migrations/202611030002_freeform_piece_movement.sql`

Run it once, after the original `001` migration. Do not rerun `001` on an already configured database. New projects require both migrations in filename order. The new migration adds server-validated loose-piece movement; a shared move is not marked as saved unless the server accepts it.

Test with two separate browser profiles: leave a piece in a wrong location, verify the other player sees it, reconnect, move it again, and finally solve it. Hosted Supabase integration still needs validation against your project; local database checks do not replace that test.

## Automated checks

```sh
npm run build
npm run lint
npm test
npm run test:db
npm run test:e2e
```

Browser tests use the system Chromium path in the cloud environment. On a laptop, follow the browser installation/configuration instructions in the README before running `test:e2e`; manual play does not require Playwright setup.
