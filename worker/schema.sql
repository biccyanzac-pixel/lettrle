-- D1 schema for Lettrle's leaderboard. It lives in the shared `words-leaderboard` database (the free plan's last
-- D1 slot), which other word games may share later. So every table here starts with `lettrle_`, and another game
-- adds its own prefixed tables and never touches these.
--
-- The browser sends only the words it guessed. The worker works out the day's word from the date
-- (site/js/daily.js, bundled at deploy), checks each guess is a real word, colours it, and times the game itself
-- from its own clock: started at /api/start, finished at the solving (or sixth) guess.

CREATE TABLE IF NOT EXISTS lettrle_players (
  id         TEXT PRIMARY KEY,   -- server-generated UUID
  token_hash TEXT NOT NULL,      -- SHA-256 of a server-issued session token
  created_at TEXT NOT NULL
);

-- One row per player per puzzle day, made at the start and updated as guesses arrive (the hub counts plays from
-- here: rowid, player_id, day_key, is_late, started_at).
CREATE TABLE IF NOT EXISTS lettrle_games (
  player_id    TEXT NOT NULL REFERENCES lettrle_players (id),
  day_key      TEXT NOT NULL,                  -- puzzle's UTC day, YYYY-MM-DD
  is_late      INTEGER NOT NULL DEFAULT 0,     -- 1 = started after its day (archive replay), decided by the server
  display_name TEXT NOT NULL,
  guesses      TEXT NOT NULL DEFAULT '',       -- comma-separated words, in order
  marks        TEXT NOT NULL DEFAULT '',       -- comma-separated colours per guess (g/y/x), in order
  n            INTEGER NOT NULL DEFAULT 0 CHECK (n >= 0 AND n <= 6),
  finished     INTEGER NOT NULL DEFAULT 0,
  solved       INTEGER NOT NULL DEFAULT 0,
  rank_n       INTEGER,                        -- guesses taken, 7 for a miss; set when finished
  ms           INTEGER,                        -- server-timed, start to finish
  started_at   TEXT NOT NULL,
  finished_at  TEXT,
  UNIQUE (player_id, day_key)
);
CREATE INDEX IF NOT EXISTS lettrle_games_board ON lettrle_games (day_key, is_late, finished, rank_n, ms, finished_at);

-- Per-day counters for the board header and the archive list (D1 free plan: keep running totals, don't scan).
CREATE TABLE IF NOT EXISTS lettrle_day_stats (
  day_key  TEXT NOT NULL,
  is_late  INTEGER NOT NULL,
  players  INTEGER NOT NULL DEFAULT 0,   -- started
  finished INTEGER NOT NULL DEFAULT 0,
  solved   INTEGER NOT NULL DEFAULT 0,
  best     INTEGER,                      -- fewest guesses by anyone who solved it
  PRIMARY KEY (day_key, is_late)
);
