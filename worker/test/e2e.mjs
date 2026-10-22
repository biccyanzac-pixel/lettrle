/**
 * End-to-end test against a running worker (wrangler dev --local = real Miniflare + local D1, no mocks).
 *   rm -rf .wrangler && npm run db:init:local && npm run dev:local      (in another terminal)
 *   npm test                                                           (or: node test/e2e.mjs http://127.0.0.1:8851)
 */
import { EPOCH, MIN_MS, addDays, isValid, marks, puzzle, todayKey } from '../../site/js/daily.js';

const BASE = process.argv[2] || 'http://127.0.0.1:8851';
const today = todayKey();
const yesterday = addDays(today, -1);
const word = puzzle(today).word;
const len = word.length;

let failures = 0;
const check = (label, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  ' + detail : ''}`); if (!ok) failures++; };
async function call(path, body) {
  const res = await fetch(BASE + path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined);
  return { status: res.status, body: await res.json() };
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// some real words of today's length that aren't the answer
const pool = (len === 5 ? ['crane', 'pious', 'lymph', 'dwarf', 'gecko', 'tubby', 'blitz', 'shove'] : ['planet', 'rhythm', 'jockey', 'muffin', 'zigzag', 'bounce', 'dwarfs', 'clumsy'])
  .filter((w) => w !== word && isValid(w));

const a = (await call('/api/session', {})).body, b = (await call('/api/session', {})).body, c = (await call('/api/session', {})).body;
check('session issues id + token', !!a.playerId && !!a.token && a.playerId !== b.playerId);

let r = await call('/api/guess', { ...a, day: today, index: 0, guess: pool[0] });
check('a guess before starting is refused', r.status === 409 && r.body.error === 'not_started');
r = await call('/api/start', { ...a, day: today, name: 'Ada' });
check('start returns an empty game, no answer', r.status === 200 && r.body.guesses.length === 0 && r.body.answer === undefined && !r.body.late, JSON.stringify(r.body));
const startedAt = r.body.startedAt;
r = await call('/api/start', { ...a, day: today, name: 'Ada' });
check('start again resumes, clock not reset', r.body.startedAt === startedAt);

r = await call('/api/guess', { ...a, day: today, index: 0, guess: pool[0] });
check('guess coloured by the server', r.status === 200 && r.body.mark === marks(pool[0], word) && r.body.guesses.length === 1, JSON.stringify(r.body));
check('answer stays hidden mid-game', r.body.answer === undefined);
r = await call('/api/guess', { ...a, day: today, index: 0, guess: pool[0] });
check('retried guess is not counted twice', r.status === 200 && r.body.guesses.length === 1);
r = await call('/api/guess', { ...a, day: today, index: 0, guess: pool[1] });
check('a different word for a used slot is refused', r.status === 409 && r.body.error === 'already');
r = await call('/api/guess', { ...a, day: today, index: 3, guess: pool[1] });
check('guesses must be in order', r.status === 409 && r.body.error === 'out_of_order' && r.body.state.guesses.length === 1);
r = await call('/api/guess', { ...a, day: today, index: 1, guess: 'zzzzzz'.slice(0, len) });
check('a non-word is refused', r.status === 400 && r.body.error === 'not_a_word');
r = await call('/api/guess', { ...a, day: today, index: 1, guess: len === 5 ? 'planet' : 'crane' });
check('wrong length is refused', r.status === 400 && r.body.error === 'bad_length');

// Ada solves on guess 3, slowly; Bo solves on guess 3 faster; Cy misses all six
r = await call('/api/guess', { ...a, day: today, index: 1, guess: pool[1] });
await wait(MIN_MS + 200);
r = await call('/api/guess', { ...a, day: today, index: 2, guess: word.toUpperCase() });
check('solving guess finishes the game and reveals the word', r.status === 200 && r.body.solved && r.body.finished && r.body.answer === word, JSON.stringify(r.body));
check('server timed it', r.body.ms >= MIN_MS, String(r.body.ms));
r = await call('/api/guess', { ...a, day: today, index: 3, guess: pool[3] });
check('no guesses after the end', r.status === 409 && r.body.error === 'finished');

await call('/api/start', { ...b, day: today, name: 'Bo' });
r = await call('/api/guess', { ...b, day: today, index: 0, guess: word });
check('instant solve refused as impossibly fast', r.status === 400 && r.body.error === 'bad_time');
await call('/api/guess', { ...b, day: today, index: 0, guess: pool[2] });
await call('/api/guess', { ...b, day: today, index: 1, guess: pool[3] });
await wait(MIN_MS + 50); // Ada started earlier, so Bo is quicker
r = await call('/api/guess', { ...b, day: today, index: 2, guess: word });
check('Bo solves in 3', r.body.solved === true, JSON.stringify(r.body));

await call('/api/start', { ...c, day: today, name: 'Cy' });
for (let i = 0; i < 6; i++) r = await call('/api/guess', { ...c, day: today, index: i, guess: pool[i] });
check('six misses end the game unsolved, word revealed', r.body.finished && !r.body.solved && r.body.answer === word);

r = await call(`/api/leaderboard?day=${today}&playerId=${a.playerId}`);
const order = r.body.top.map((x) => `${x.name}:${x.guesses}${x.solved ? '' : 'x'}`).join(',');
check('board: fewest guesses, then fastest', order === 'Bo:3,Ada:3,Cy:6x', order + ' ' + JSON.stringify(r.body.top.map((x) => x.ms)));
check('board shows colours, never letters', r.body.top[0].marks.length === 3 && !JSON.stringify(r.body).includes(word), JSON.stringify(r.body.top[0]));
check('you flagged', r.body.top[1].you === true);
check('day counts', r.body.players === 3 && r.body.finished === 3 && r.body.solved === 2, JSON.stringify(r.body));

r = await call('/api/start', { ...a, day: addDays(today, 1), name: 'Ada' });
check('future day refused', r.status === 400 && r.body.error === 'bad_day');
r = await call('/api/start', { ...a, day: addDays(EPOCH, -1), name: 'Ada' });
check('day before Lettrle #1 refused', r.status === 400);
r = await call('/api/start', { ...a, token: 'nope', day: today, name: 'Ada' });
check('bad token refused', r.status === 401);
r = await call('/api/start', { ...b, day: today, name: '' });
check('empty name refused', r.status === 400 && r.body.error === 'bad_name');

if (yesterday >= EPOCH) {
  r = await call('/api/start', { ...a, day: yesterday, name: 'Ada' });
  check('yesterday goes on the late board', r.status === 200 && r.body.late === true);
  const yw = puzzle(yesterday).word;
  await wait(MIN_MS + 200);
  await call('/api/guess', { ...a, day: yesterday, index: 0, guess: yw });
  r = await call(`/api/leaderboard?day=${yesterday}&late=1`);
  check('late board separate', r.body.top.length === 1 && r.body.late === true && r.body.top[0].guesses === 1);
  r = await call(`/api/leaderboard?day=${yesterday}`);
  check('real board untouched', r.body.top.length === 0);
} else console.log('SKIP  late board (yesterday is before EPOCH)');

r = await call(`/api/days?from=${addDays(today, -3)}&to=${today}`);
check('days summary', r.body.days[today]?.players === 3 && r.body.days[today]?.best === 3, JSON.stringify(r.body.days));

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
