# Lettrle: notes for coding agents

Guess the day's word in six tries (green / yellow / grey tiles). Start with README.md.

Critical rules:
- **jacob.gg house rules and shared kit:** read `../jacob.gg/PLAYBOOK.md` before changing the look, the results screen, the leaderboard flow or the leaderboard table. The page loads `jacob.gg/kit/jgg.css` + `jgg.js`: don't redefine the kit's base CSS here. If the `lettrle_games` table changes, update the hub's `worker/src/sources.js` so plays keep counting.
- **Never change a past or current day.** The day's word is `puzzle(day)` in `site/js/daily.js`: the weekday picks a band in `site/js/words/answers.js`, the week number picks the word. The bands are frozen in order. Never reorder or delete an answer, never re-run `tools/build-words.mjs` over `answers.js`, never change `EPOCH`. `test/daily.test.mjs` pins golden days and a two-year fingerprint.
- **Room play:** inside the jacob.gg/play iframe the game posts `{ jgg: 'room', type: 'progress' | 'finish', ... }` to the parent. Colours only, never letters. The contract is `../jacob.gg/docs/room-contract.md`; the lobby reads `#done` and `#room-score`.
- **Shared database:** the worker uses the `words-leaderboard` D1, shared with future word games (the free plan's last D1). Every Lettrle table is named `lettrle_*`. Never touch another game's tables in it.
- After changing `site/js/daily.js` or `site/js/words/*`, redeploy the worker (`cd worker && npx wrangler deploy`). It bundles them to check guesses.
- Free project: ask the owner before adding any paid service. Commit as `biccyanzac-pixel <285977456+biccyanzac-pixel@users.noreply.github.com>` (repo-local config).
- Ports: site 8085, worker 8851.
- Tests: `npm test` (schedule, colours, word lists); `cd worker && rm -rf .wrangler && npm run db:init:local && npm run dev:local`, then `npm test` in `worker/`; `node tools/e2e-ui.mjs` (headless Chrome; needs the hub worker on 8831 for the rating box, or `HUB=off`).
