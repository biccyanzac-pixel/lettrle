// localStorage, wrapped so the game works with storage blocked or empty (private mode, cleared data).
// One game per day: { guesses: [word], marks: ['gyx..'], startedAt, finishedAt, ms, sent, late }
//   sent = how many guesses the server has; ms = the server's time once it has timed the game.

const KEY = 'lettrle:games:v1';

function readAll() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}

let mem = readAll();

function writeAll() {
  try { localStorage.setItem(KEY, JSON.stringify(mem)); } catch { /* storage blocked: progress lasts for this page */ }
}

export function game(day) {
  const g = mem[day] || {};
  return { guesses: g.guesses || [], marks: g.marks || [], startedAt: g.startedAt ?? null, finishedAt: g.finishedAt ?? null,
    ms: g.ms ?? null, sent: g.sent || 0, late: !!g.late, answer: g.answer ?? null };
}

export function save(day, g) {
  mem[day] = g;
  writeAll();
}

export const finished = (g, max) => g.marks.some((m) => /^g+$/.test(m)) || g.marks.length >= max;

/** Consecutive days (ending today or yesterday) solved on the day itself. */
export function streak(today, addDays) {
  const won = (d) => { const g = mem[d]; return g && !g.late && (g.marks || []).some((m) => /^g+$/.test(m)); };
  let n = 0;
  let d = won(today) ? today : addDays(today, -1);
  while (won(d)) { n++; d = addDays(d, -1); }
  return n;
}
