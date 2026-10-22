# Lettrle

A jacob.gg daily game: guess the day's word in six tries. After each guess every tile turns
green (right letter, right place), yellow (in the word, somewhere else) or grey (not in the word).

- Live: https://biccyanzac-pixel.github.io/lettrle/ (from the `gh-pages` branch)
- Leaderboard: https://lettrle-leaderboard.jacob-gg-leaderboard-worker.workers.dev
- House rules, kit and hub: `../jacob.gg/PLAYBOOK.md`

## How a day works

- **Same word for everyone**, new at 00:00 UTC. `puzzle(day)` in `site/js/daily.js` makes it from the date alone, in
  the browser and in the worker. Archive days use `?day=YYYY-MM-DD`.
- **Weekday curve.** Each weekday has its own band of answers in `site/js/words/answers.js`:

  | Day | Answers |
  | --- | --- |
  | Monday | the most common 5-letter words (SCOWL level 10), 397 words |
  | Tuesday | common (SCOWL 20), 433 |
  | Wednesday | SCOWL 35, the easier half by letter pattern, 517 |
  | Thursday | SCOWL 35, the harder half by letter pattern, 516 |
  | Friday | rarer words hand-picked from SCOWL 40–55, easier half, 174 |
  | Saturday | the same pool, harder half, 173 |
  | Sunday special | a **six-letter** word (SCOWL 10+20), 886 |

  "Letter pattern" means words with many one-letter neighbours (the _ATCH trap), repeated letters or rare letters
  count as harder (`hardness()` in `tools/build-words.mjs`). The k-th Monday since `EPOCH` uses Monday's k-th word,
  so no word repeats for at least 173 weeks.
- **Valid guesses**: ENABLE (public domain) plus SCOWL up to level 70 in every English spelling, 8,882 five-letter
  and 15,592 six-letter words (`site/js/words/valid.js`).
- **Ranking**: fewest guesses (a miss counts as 7), then the fastest time, then whoever finished first.

## The leaderboard worker

`worker/` is a Cloudflare Worker on the shared `words-leaderboard` D1 (tables `lettrle_*`, see `worker/schema.sql`).
The browser only sends words:

- `POST /api/session` → `{ playerId, token }` (the token is stored hashed).
- `POST /api/start { day, name }` starts the server's clock (or resumes; one game per player per day). Late (archive)
  is decided by the server's clock here.
- `POST /api/guess { day, index, guess }` → the server checks the word and its length, colours it, and on the solving
  or sixth guess records the server-timed `ms`. `index` makes retries safe. A solve under 3 s is refused.
- `GET /api/leaderboard?day=&late=&playerId=` (colours only, never letters) and `GET /api/days?from=&to=`.

The site sends each guess as it's made and retries what's missing (`flush()` in `site/js/app.js`); with no worker the
game still plays, just without a board.

## Play together

Inside the jacob.gg/play lobby (an iframe), each guess posts `{ jgg: 'room', type: 'progress', rows: ['gyxxg', …] }`
and the end posts `type: 'finish'` with `score` (6 for a first-guess solve down to 1, 0 for a miss). Colours only,
never letters. Contract: `../jacob.gg/docs/room-contract.md`.

## Run and test locally

```
npm install && npm test                      # schedule, colours, word lists
cd worker && npm install && rm -rf .wrangler && npm run db:init:local && npm run dev:local   # worker on 8851
npm test                                     # in worker/: API e2e
node tools/e2e-ui.mjs                        # from the root: headless Chrome at 360 px and desktop, room messages
npm run serve                                # site on http://localhost:8085/?api=http://127.0.0.1:8851
```

## Deploy (only when the owner says)

```
cd worker && npm run db:init && npx wrangler deploy      # schema into words-leaderboard, then the worker
git subtree split --prefix site -b gh-pages && git push -f origin gh-pages
```

Turn on GitHub Pages for the `gh-pages` branch once. Then the hub (`../jacob.gg`): merge its Lettrle PR and redeploy
the hub worker.

## Word lists and licences

Built once by `node tools/build-words.mjs <enable1.txt> <scowl final/>` (sources and URLs are in the script), then
curated by hand (`tools/blocklist.mjs`, `tools/curation.mjs`). SCOWL is © Kevin Atkinson and others under a
permissive licence whose notice must travel with the lists: `site/WORDLIST-LICENSE.txt`, also shown on
`site/credits.html`. ENABLE is public domain.
