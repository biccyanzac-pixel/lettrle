// node --test test/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { BANDS, EPOCH, addDays, dayNumber, hasPuzzle, isValid, marks, puzzle, roomScore } from '../site/js/daily.js';
import { BLOCK } from '../tools/blocklist.mjs';

// Golden days: these words are what players saw (or will see). If this test fails, a change has altered a past or
// scheduled day. Revert it: the answer bands in site/js/words/answers.js are frozen in order.
const GOLDEN = {
  '2026-10-21': 'lance', '2026-10-22': 'affix', '2026-10-23': 'amigo', '2026-10-24': 'tangy', '2026-10-25': 'sermon',
  '2026-10-26': 'right', '2026-10-27': 'focus', '2026-10-28': 'chirp', '2026-10-29': 'spore', '2026-10-30': 'druid',
  '2026-10-31': 'frizz', '2026-11-01': 'devise', '2026-11-02': 'image', '2026-11-03': 'vowel', '2026-11-04': 'satin',
  '2026-11-05': 'mange', '2026-11-06': 'grump', '2026-11-07': 'swank', '2026-11-08': 'single', '2026-11-09': 'sleep',
  '2026-11-10': 'flame', '2026-11-11': 'bride', '2026-11-12': 'winch', '2026-11-13': 'divan', '2026-11-14': 'civet',
  '2026-11-15': 'itself', '2026-11-16': 'leave', '2026-11-17': 'shove',
};
// A fingerprint of the first two years, so any reorder of a band shows up even past the golden days.
const FINGERPRINT_DAYS = 730;
const FINGERPRINT = '13fe3eca';

test('golden days never change', () => {
  for (const [day, word] of Object.entries(GOLDEN)) assert.equal(puzzle(day).word, word, day);
});

test('two-year schedule fingerprint', () => {
  let h = 2166136261;
  for (let i = 0; i < FINGERPRINT_DAYS; i++) for (const c of puzzle(addDays(EPOCH, i)).word) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  const got = h.toString(16);
  if (FINGERPRINT === 'see test output') console.log('fingerprint:', got);
  else assert.equal(got, FINGERPRINT);
});

test('weekday curve: Sunday is six letters, the rest five', () => {
  for (let i = 0; i < 28; i++) {
    const p = puzzle(addDays(EPOCH, i));
    assert.equal(p.length, p.weekday === 0 ? 6 : 5, p.day);
  }
});

test('puzzle is deterministic and numbered from EPOCH', () => {
  assert.equal(dayNumber(EPOCH), 1);
  assert.deepEqual(puzzle('2027-03-14'), puzzle('2027-03-14'));
  assert.equal(hasPuzzle(addDays(EPOCH, -1)), false);
  assert.throws(() => puzzle('2001-01-01'));
});

test('no word repeats until its band runs out', () => {
  const seen = new Map();
  for (let i = 0; i < 7 * 170; i++) {
    const { word, day } = puzzle(addDays(EPOCH, i));
    assert.ok(!seen.has(word), `${word} on ${day} and ${seen.get(word)}`);
    seen.set(word, day);
  }
});

test('answer bands are clean', () => {
  const all = new Set();
  BANDS.forEach((band, wd) => {
    for (const w of band) {
      assert.match(w, wd === 0 ? /^[a-z]{6}$/ : /^[a-z]{5}$/);
      assert.ok(!all.has(w), `duplicate ${w}`);
      assert.ok(!BLOCK.has(w), `blocked ${w}`);
      assert.ok(isValid(w), `answer ${w} must be a valid guess`);
      all.add(w);
    }
  });
  assert.ok(BANDS.every((b) => b.length >= 150));
});

test('valid guesses', () => {
  for (const w of ['crane', 'adieu', 'zebra', 'sermon', 'rhythm']) assert.ok(isValid(w), w);
  for (const w of ['zzzzz', 'abcde', 'CRANE', 'cran', 'cranes1', '', null, 'craness']) assert.ok(!isValid(w), String(w));
});

test('marks: greens, yellows and repeated letters', () => {
  assert.equal(marks('crane', 'crane'), 'ggggg');
  assert.equal(marks('speed', 'abide'), 'xxyxy');  // only one E in the answer: the first E is yellow, the second grey
  assert.equal(marks('eerie', 'there'), 'yxyxg');  // the green E uses one E up
  assert.equal(marks('llama', 'hello'), 'yyxxx');
  assert.equal(marks('sassy', 'essay'), 'yygxg');  // essay has two S: one green, one yellow, the third S grey
  assert.equal(marks('banner', 'bandit'), 'gggxxx');
});

test('room score: more is better', () => {
  assert.equal(roomScore(true, 1), 6);
  assert.equal(roomScore(true, 6), 1);
  assert.equal(roomScore(false, 6), 0);
});
