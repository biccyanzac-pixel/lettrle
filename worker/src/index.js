/**
 * Lettrle leaderboard: Cloudflare Worker + D1 (the shared `words-leaderboard` database, tables `lettrle_*`).
 * Same shape as Factle's worker.
 *
 * No result is client-reported. The browser sends the words it guesses, one at a time. This worker
 *   - works out the day's word from the date with the same code the site uses (site/js/daily.js),
 *   - rejects anything that isn't a real word of the right length, and colours each guess itself,
 *   - times the game from its own clock: /api/start to the solving or sixth guess,
 *   - decides "late" (archive replay) from its own clock at the start, and keeps one game per player per day.
 * What it can't stop is someone reading the word out of the public site code; that is the accepted trade-off of a
 * free static game whose puzzles are generated in the browser.
 */
import { FAIL_RANK, MAX_GUESSES, MIN_MS, hasPuzzle, isValid, marks, puzzle, solvedMarks, todayKey, validDay } from '../../site/js/daily.js';

const MAX_NAME = 20;
const BOARD_SIZE = 20;

function validateName(raw) {
  if (typeof raw !== 'string') return null;
  const name = raw.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
  if (!name || [...name].length > MAX_NAME) return null;
  return name;
}

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// --- HTTP plumbing ---

function allowedOrigin(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!allowed.length) return '*';
  return allowed.includes(origin) ? origin : allowed[0];
}

function cors(request, env) {
  return {
    'Access-Control-Allow-Origin': allowedOrigin(request, env),
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(request, env, body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...cors(request, env) } });
}

function fail(request, env, code, message, status, extra = {}) {
  return json(request, env, { error: code, message, ...extra }, status);
}

const hits = new Map(); // in-memory, per isolate: enough to blunt a burst
function rateLimited(ip, bucket, limit) {
  const now = Date.now(), key = `${bucket}:${ip}`;
  const recent = (hits.get(key) ?? []).filter((t) => now - t < 3600_000);
  const over = recent.length >= limit;
  if (!over) recent.push(now);
  hits.set(key, recent);
  return over;
}

async function readBody(request) {
  try { return (await request.json()) ?? {}; } catch { return null; }
}

// --- players and games ---

async function handleSession(request, env, ip) {
  if (rateLimited(ip, 'session', 30)) return fail(request, env, 'rate_limited', 'Too many new sessions from here.', 429);
  const playerId = crypto.randomUUID(), token = crypto.randomUUID();
  await env.DB.prepare('INSERT INTO lettrle_players (id, token_hash, created_at) VALUES (?, ?, ?)')
    .bind(playerId, await sha256Hex(token), new Date().toISOString()).run();
  return json(request, env, { playerId, token });
}

async function verifyPlayer(env, playerId, token) {
  if (typeof playerId !== 'string' || typeof token !== 'string' || !playerId || !token) return false;
  const row = await env.DB.prepare('SELECT token_hash FROM lettrle_players WHERE id = ?').bind(playerId).first();
  return !!row && row.token_hash === (await sha256Hex(token));
}

const split = (s) => (s ? s.split(',') : []);

/** What the browser gets back about a game. The word is only included once the game is over. */
function gameView(row, day) {
  return {
    day, late: !!row.is_late, startedAt: row.started_at, guesses: split(row.guesses), marks: split(row.marks),
    finished: !!row.finished, solved: !!row.solved, ms: row.ms, answer: row.finished ? puzzle(day).word : undefined,
  };
}

const getGame = (env, playerId, day) =>
  env.DB.prepare('SELECT * FROM lettrle_games WHERE player_id = ? AND day_key = ?').bind(playerId, day).first();

function checkDay(request, env, day) {
  if (!validDay(day) || !hasPuzzle(day)) return fail(request, env, 'bad_day', 'There is no Lettrle for that day.', 400);
  if (day > todayKey()) return fail(request, env, 'bad_day', "That day hasn't happened yet.", 400);
  return null;
}

/** Start (or resume) the player's game for a day. The server's clock starts here. */
async function handleStart(request, env, ip) {
  if (rateLimited(ip, 'start', 120)) return fail(request, env, 'rate_limited', 'Too many games from here. Try again later.', 429);
  const body = await readBody(request);
  if (!body) return fail(request, env, 'bad_request', 'Invalid JSON.', 400);
  const { playerId, token, day } = body;
  if (!(await verifyPlayer(env, playerId, token))) return fail(request, env, 'bad_session', 'Invalid or missing session. Reload the page.', 401);
  const bad = checkDay(request, env, day);
  if (bad) return bad;
  const name = validateName(body.name);
  if (!name) return fail(request, env, 'bad_name', `Name must be 1-${MAX_NAME} characters.`, 400);

  const late = day !== todayKey() ? 1 : 0;
  const now = new Date().toISOString();
  const ins = await env.DB.prepare(
    `INSERT INTO lettrle_games (player_id, day_key, is_late, display_name, started_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (player_id, day_key) DO NOTHING`,
  ).bind(playerId, day, late, name, now).run();
  if (ins.meta?.changes) {
    await env.DB.prepare(
      `INSERT INTO lettrle_day_stats (day_key, is_late, players) VALUES (?, ?, 1)
         ON CONFLICT (day_key, is_late) DO UPDATE SET players = players + 1`,
    ).bind(day, late).run();
  }
  const row = await getGame(env, playerId, day);
  return json(request, env, gameView(row, day));
}

/** One guess. `index` is which guess this is (0-5), so a retried request can't count twice. */
async function handleGuess(request, env, ip) {
  if (rateLimited(ip, 'guess', 600)) return fail(request, env, 'rate_limited', 'Too many guesses from here. Try again later.', 429);
  const body = await readBody(request);
  if (!body) return fail(request, env, 'bad_request', 'Invalid JSON.', 400);
  const { playerId, token, day, index } = body;
  const guess = typeof body.guess === 'string' ? body.guess.toLowerCase() : '';
  if (!(await verifyPlayer(env, playerId, token))) return fail(request, env, 'bad_session', 'Invalid or missing session. Reload the page.', 401);
  const bad = checkDay(request, env, day);
  if (bad) return bad;
  const row = await getGame(env, playerId, day);
  if (!row) return fail(request, env, 'not_started', 'Start the game first.', 409);
  if (!Number.isInteger(index) || index < 0 || index >= MAX_GUESSES) return fail(request, env, 'bad_index', 'Invalid guess number.', 400);

  const { word } = puzzle(day);
  const done = split(row.guesses);
  if (index < done.length) {
    // a retry of a guess we already have: answer it again, change nothing
    if (done[index] === guess) return json(request, env, { ...gameView(row, day), index, mark: split(row.marks)[index] });
    return fail(request, env, 'already', 'That guess was already made.', 409, { state: gameView(row, day) });
  }
  if (index > done.length) return fail(request, env, 'out_of_order', 'Guesses must arrive in order.', 409, { state: gameView(row, day) });
  if (row.finished) return fail(request, env, 'finished', 'This game is over.', 409, { state: gameView(row, day) });
  if (guess.length !== word.length) return fail(request, env, 'bad_length', `Guesses are ${word.length} letters today.`, 400);
  if (!isValid(guess)) return fail(request, env, 'not_a_word', 'Not in the word list.', 400);

  const mark = marks(guess, word);
  const n = index + 1;
  const solved = solvedMarks(mark);
  const finished = solved || n === MAX_GUESSES;
  const now = new Date();
  const ms = finished ? now - Date.parse(row.started_at) : null;
  if (finished && solved && ms < MIN_MS) return fail(request, env, 'bad_time', 'That was impossibly fast.', 400);

  const res = await env.DB.prepare(
    `UPDATE lettrle_games SET guesses = ?, marks = ?, n = ?, finished = ?, solved = ?, rank_n = ?, ms = ?, finished_at = ?
      WHERE player_id = ? AND day_key = ? AND n = ?`,
  ).bind([...done, guess].join(','), [...split(row.marks), mark].join(','), n, finished ? 1 : 0, solved ? 1 : 0,
    finished ? (solved ? n : FAIL_RANK) : null, ms, finished ? now.toISOString() : null, playerId, day, index).run();
  if (!res.meta?.changes) return fail(request, env, 'conflict', 'Another guess arrived at the same time. Reload the page.', 409);
  if (finished) {
    await env.DB.prepare(
      `UPDATE lettrle_day_stats SET finished = finished + 1, solved = solved + ?,
         best = CASE WHEN ? = 1 THEN MIN(COALESCE(best, 99), ?) ELSE best END
       WHERE day_key = ? AND is_late = ?`,
    ).bind(solved ? 1 : 0, solved ? 1 : 0, n, day, row.is_late).run();
  }
  const after = await getGame(env, playerId, day);
  return json(request, env, { ...gameView(after, day), index, mark });
}

// --- boards ---

const BOARD_COLS = 'player_id, display_name, n, solved, rank_n, ms, marks, finished_at';
const view = (r, rank, playerId) => ({
  rank, name: r.display_name, guesses: r.n, solved: !!r.solved, ms: r.ms, marks: split(r.marks), you: r.player_id === playerId,
});

export async function fetchBoard(env, day, late, playerId) {
  const lateN = late ? 1 : 0;
  const { results } = await env.DB.prepare(
    `SELECT ${BOARD_COLS} FROM lettrle_games WHERE day_key = ? AND is_late = ? AND finished = 1
      ORDER BY rank_n ASC, ms ASC, finished_at ASC LIMIT ?`,
  ).bind(day, lateN, BOARD_SIZE).all();
  const top = (results ?? []).map((r, i) => view(r, i + 1, playerId));
  const stats = await env.DB.prepare('SELECT players, finished, solved, best FROM lettrle_day_stats WHERE day_key = ? AND is_late = ?')
    .bind(day, lateN).first();
  let you = null;
  if (playerId && !top.some((r) => r.you)) {
    const mine = await env.DB.prepare(
      `SELECT ${BOARD_COLS} FROM lettrle_games WHERE player_id = ? AND day_key = ? AND is_late = ? AND finished = 1`,
    ).bind(playerId, day, lateN).first();
    if (mine) {
      const above = await env.DB.prepare(
        `SELECT COUNT(*) AS c FROM lettrle_games WHERE day_key = ? AND is_late = ? AND finished = 1
           AND (rank_n < ? OR (rank_n = ? AND (ms < ? OR (ms = ? AND finished_at < ?))))`,
      ).bind(day, lateN, mine.rank_n, mine.rank_n, mine.ms, mine.ms, mine.finished_at).first();
      you = view(mine, (above?.c ?? 0) + 1, playerId);
    }
  }
  return { day, late: !!late, players: stats?.players ?? 0, finished: stats?.finished ?? 0, solved: stats?.solved ?? 0, top, you };
}

async function handleLeaderboard(request, env) {
  const url = new URL(request.url);
  const day = url.searchParams.get('day') || todayKey();
  if (!validDay(day)) return fail(request, env, 'bad_day', 'Invalid day.', 400);
  return json(request, env, await fetchBoard(env, day, url.searchParams.get('late') === '1', url.searchParams.get('playerId')));
}

async function handleDays(request, env) {
  const url = new URL(request.url);
  const to = url.searchParams.get('to') || todayKey();
  const from = url.searchParams.get('from') || to;
  if (!validDay(from) || !validDay(to)) return fail(request, env, 'bad_day', 'Invalid day.', 400);
  const { results } = await env.DB.prepare(
    'SELECT day_key, is_late, players, solved, best FROM lettrle_day_stats WHERE day_key BETWEEN ? AND ?',
  ).bind(from, to).all();
  const days = {};
  for (const r of results ?? []) {
    days[r.day_key] ??= { players: 0, solved: 0, best: null, latePlayers: 0 };
    if (r.is_late) days[r.day_key].latePlayers = r.players;
    else Object.assign(days[r.day_key], { players: r.players, solved: r.solved, best: r.best });
  }
  return json(request, env, { days });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors(request, env) });
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    try {
      if (url.pathname === '/api/session' && request.method === 'POST') return await handleSession(request, env, ip);
      if (url.pathname === '/api/start' && request.method === 'POST') return await handleStart(request, env, ip);
      if (url.pathname === '/api/guess' && request.method === 'POST') return await handleGuess(request, env, ip);
      if (url.pathname === '/api/leaderboard' && request.method === 'GET') return await handleLeaderboard(request, env);
      if (url.pathname === '/api/days' && request.method === 'GET') return await handleDays(request, env);
      return fail(request, env, 'not_found', 'No such endpoint.', 404);
    } catch (err) {
      console.error(err);
      return fail(request, env, 'server_error', 'Something broke. Try again.', 500);
    }
  },
};
