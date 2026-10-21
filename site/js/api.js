// Leaderboard client (worker/). Every call fails soft: with no backend the game still works, just without a board.
// The URL comes from data/config.json; ?api=<url> overrides it for local testing, ?api=off turns it off.

const SESSION_KEY = 'lettrle:session';
const NAME_KEY = 'lettrle:name';
let base;
let memSession = null;

export async function loadConfig() {
  if (base !== undefined) return base;
  try {
    const cfg = await (await fetch('data/config.json', { cache: 'no-cache' })).json();
    const override = new URLSearchParams(location.search).get('api');
    base = override === 'off' ? null : (override || cfg.leaderboardUrl || '').replace(/\/+$/, '') || null;
  } catch { base = null; }
  return base;
}

export const enabled = () => !!base;

async function call(path, body) {
  if (!base) throw new Error('No leaderboard configured.');
  const res = await fetch(base + path, body === undefined ? undefined
    : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  let data = null;
  try { data = await res.json(); } catch { /* handled below */ }
  if (!res.ok) {
    const e = new Error(data?.message || `Leaderboard error (HTTP ${res.status}).`);
    e.status = res.status; e.code = data?.error; e.state = data?.state;
    throw e;
  }
  return data;
}

function readSession() { try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; } }
function writeSession(s) { try { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch { /* private mode */ } }

export async function session(fresh = false) {
  if (!fresh) { const s = memSession || readSession(); if (s?.playerId && s?.token) return (memSession = s); }
  memSession = await call('/api/session', {});
  writeSession(memSession);
  return memSession;
}

export function playerId() { return (memSession || readSession())?.playerId ?? null; }
// Lettrle's name, else the one used in any other jacob.gg game (kit/jgg.js); saving shares it back.
export function savedName() { try { return window.JGG?.name() || localStorage.getItem(NAME_KEY) || ''; } catch { return ''; } }
export function saveName(n) { window.JGG?.setName(n); try { localStorage.setItem(NAME_KEY, n); } catch { /* ignore */ } }

async function withSession(path, body) {
  let s = await session();
  try { return await call(path, { ...s, ...body }); }
  catch (e) {
    if (e.code !== 'bad_session') throw e;
    s = await session(true);
    return call(path, { ...s, ...body });
  }
}

/** Start (or resume) the day's game. The server's clock starts at the first call. Returns the server's state. */
export function start(day, name) { return withSession('/api/start', { day, name }); }

/** One guess; `index` is 0-5. The server checks the word, colours it and, at the end, times the game. */
export function guess(day, index, word) { return withSession('/api/guess', { day, index, guess: word }); }

export function board(day, late = false) {
  const pid = playerId();
  return call(`/api/leaderboard?day=${day}${late ? '&late=1' : ''}${pid ? '&playerId=' + encodeURIComponent(pid) : ''}`);
}

export function days(from, to) { return call(`/api/days?from=${from}&to=${to}`); }
