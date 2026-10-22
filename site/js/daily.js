// Shared by the site and the leaderboard worker (worker/src/index.js imports this file), so the day's word,
// the colours of a guess and the ranking can never disagree between the two.
//
// Today's word comes from the date alone: the weekday picks a band (Monday the most common words, Saturday the
// rarest, Sunday a six-letter word) and the number of that weekday since EPOCH picks the word in the band.
// The bands in words/answers.js are frozen in order, so a past day can never change.
import { SUN, MON, TUE, WED, THU, FRI, SAT } from './words/answers.js';
import { VALID5, VALID6 } from './words/valid.js';

export const EPOCH = '2026-10-22'; // Lettrle #1. Never change once live: it renumbers and re-picks every day.
export const MAX_GUESSES = 6;
export const BANDS = [SUN, MON, TUE, WED, THU, FRI, SAT]; // by UTC weekday, 0 = Sunday
export const FAIL_RANK = MAX_GUESSES + 1;                  // a missed word ranks below 6 guesses
export const MIN_MS = 3000;                                // faster than this isn't a human typing a word

/** UTC day key YYYY-MM-DD. */
export function todayKey(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

const dayMs = (day) => Date.parse(`${day}T00:00:00Z`);

export function dayNumber(day) {
  return Math.round((dayMs(day) - dayMs(EPOCH)) / 864e5) + 1;
}

export function addDays(day, n) {
  return new Date(dayMs(day) + n * 864e5).toISOString().slice(0, 10);
}

export function msUntilNextUtcDay(now = Date.now()) {
  return Math.ceil((now + 1) / 864e5) * 864e5 - now;
}

export function validDay(day) {
  return typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day)
    && !Number.isNaN(dayMs(day)) && new Date(dayMs(day)).toISOString().slice(0, 10) === day;
}

/** A day that has a puzzle: on or after EPOCH. (Whether it has happened yet is the caller's business.) */
export function hasPuzzle(day) {
  return validDay(day) && day >= EPOCH;
}

/** The day's puzzle: { day, number, weekday, length, word }. */
export function puzzle(day) {
  if (!hasPuzzle(day)) throw new Error(`No Lettrle for ${day}.`);
  const weekday = new Date(dayMs(day)).getUTCDay();
  const band = BANDS[weekday];
  const k = Math.floor((dayNumber(day) - 1) / 7); // how many of this weekday came before, since EPOCH
  const word = band[k % band.length];
  return { day, number: dayNumber(day), weekday, length: word.length, word };
}

let validSets = null;
/** Is this a word we accept as a guess? (Lowercase a-z, length 5 or 6.) */
export function isValid(word) {
  if (typeof word !== 'string' || !/^[a-z]{5,6}$/.test(word)) return false;
  if (!validSets) {
    validSets = { 5: new Set(), 6: new Set() };
    for (const [len, packed] of [[5, VALID5], [6, VALID6]])
      for (let i = 0; i < packed.length; i += len) validSets[len].add(packed.slice(i, i + len));
    for (const band of BANDS) for (const w of band) validSets[w.length].add(w);
  }
  return validSets[word.length].has(word);
}

/**
 * The colours of a guess: one letter per tile, g = right letter in the right place, y = in the word but somewhere
 * else, x = not in the word (or already used up by other tiles). Repeated letters are counted, as in the original.
 */
export function marks(guess, answer) {
  const out = Array(answer.length).fill('x');
  const left = {};
  for (let i = 0; i < answer.length; i++) {
    if (guess[i] === answer[i]) out[i] = 'g';
    else left[answer[i]] = (left[answer[i]] || 0) + 1;
  }
  for (let i = 0; i < answer.length; i++) {
    if (out[i] === 'g') continue;
    if (left[guess[i]] > 0) { out[i] = 'y'; left[guess[i]]--; }
  }
  return out.join('');
}

export const solvedMarks = (m) => /^g+$/.test(m);

/** Score in a Play together room: more is better, 6 for a first-guess solve down to 1 for six, 0 for a miss. */
export function roomScore(solved, guesses) {
  return solved ? FAIL_RANK - guesses : 0;
}

const EMOJI = { g: '🟩', y: '🟨', x: '⬛' };
export function emojiRow(m) {
  return [...m].map((c) => EMOJI[c]).join('');
}

/** "1:23" or "12.4 s". */
export function fmtTime(ms) {
  if (ms === null || ms === undefined) return '';
  const s = ms / 1000;
  return s < 60 ? `${s.toFixed(1)} s` : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}
