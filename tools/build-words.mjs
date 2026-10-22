// Builds the word lists from two openly licensed sources. Run once to (re)create site/js/words/*.js:
//   node tools/build-words.mjs <enable1.txt> <scowl final/ folder>
//   ENABLE:  https://raw.githubusercontent.com/dolph/dictionary/master/enable1.txt  (public domain)
//   SCOWL:   https://downloads.sourceforge.net/wordlist/scowl-2020.12.07.tar.gz       (Kevin Atkinson, permissive, see credits.html)
//
// THE ANSWER LISTS ARE FROZEN ONCE LIVE. The order of each band is the schedule (see site/js/daily.js), so after
// launch never re-run this over answers.js, never reorder or delete an answer. Edit answers.js by hand, and only
// for days that haven't happened yet (test/daily.test.mjs pins the past). valid.js can be regenerated any time.
import fs from 'node:fs';
import path from 'node:path';
import { BLOCK } from './blocklist.mjs';
import { EXCLUDE, HARD } from './curation.mjs';

const [enablePath, scowlDir, only] = process.argv.slice(2);
if (!enablePath || !scowlDir) { console.error('usage: node tools/build-words.mjs <enable1.txt> <scowl/final>'); process.exit(1); }
const OUT = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..', 'site', 'js', 'words');
fs.mkdirSync(OUT, { recursive: true });

const lines = (f) => fs.readFileSync(f, 'latin1').split(/\r?\n/).map((s) => s.trim()).filter((w) => /^[a-z]+$/.test(w));
const enable = new Set(lines(enablePath));
const scowl = (kind, level) => { const f = path.join(scowlDir, `${kind}-words.${level}`); return fs.existsSync(f) ? lines(f) : []; };
const LEVELS = [10, 20, 35, 40, 50, 55, 60, 70];

// Valid guesses: ENABLE plus every SCOWL spelling (US, UK, Canadian, Australian) up to level 70.
const valid = { 5: new Set(), 6: new Set() };
for (const w of enable) if (valid[w.length]) valid[w.length].add(w);
for (const kind of ['english', 'american', 'british', 'canadian', 'british_z', 'australian'])
  for (const n of LEVELS) for (const w of scowl(kind, n)) if (valid[w.length]) valid[w.length].add(w);

// Answers: common words in every spelling (SCOWL "english" = shared by all variants), also in ENABLE,
// no inflected forms (plurals, -ed, -ing of a shorter word), nothing on the blocklist.
const any = (w) => enable.has(w) || valid[5].has(w) || valid[6].has(w);
const allWords = new Set([...enable]);
function inflected(w) {
  if (w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us') && !w.endsWith('is') && (allWords.has(w.slice(0, -1)) || (w.endsWith('es') && allWords.has(w.slice(0, -2))))) return true;
  if (w.endsWith('ies') && allWords.has(w.slice(0, -3) + 'y')) return true;
  if (w.endsWith('ed') && (allWords.has(w.slice(0, -2)) || allWords.has(w.slice(0, -1)) || (w.endsWith('ied') && allWords.has(w.slice(0, -3) + 'y')) || (w[w.length - 3] === w[w.length - 4] && allWords.has(w.slice(0, -3))))) return true;
  if (w.endsWith('ing') && (allWords.has(w.slice(0, -3)) || allWords.has(w.slice(0, -3) + 'e') || (w[w.length - 4] === w[w.length - 5] && allWords.has(w.slice(0, -4))))) return true;
  return false;
}
const seen = new Set();
function band(len, levels) {
  const out = [];
  for (const n of levels) for (const w of scowl('english', n)) {
    if (w.length !== len || seen.has(w) || !enable.has(w) || BLOCK.has(w) || EXCLUDE.has(w) || inflected(w)) continue;
    seen.add(w); out.push(w);
  }
  return out;
}

// Seeded shuffle (mulberry32) so the build is reproducible.
function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function shuffle(a, seed) { const r = rng(seed); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// How hard a word is to pin down, apart from how rare it is: many one-letter neighbours (the _ATCH trap),
// repeated letters and rare letters all cost guesses. Used to split a pool into an easier and a harder day.
const common5 = new Set([10, 20, 35, 40, 50].flatMap((n) => scowl('english', n)).filter((w) => w.length === 5));
const RARE = { j: 1.5, q: 1.5, x: 1.5, z: 1.5, k: 0.75, v: 0.75, w: 0.5, y: 0.5, f: 0.5 };
function hardness(w) {
  let nb = 0;
  for (let i = 0; i < w.length; i++) for (const c of 'abcdefghijklmnopqrstuvwxyz')
    if (c !== w[i] && common5.has(w.slice(0, i) + c + w.slice(i + 1))) nb++;
  const repeats = w.length - new Set(w).size;
  return nb + 2 * repeats + [...w].reduce((a, c) => a + (RARE[c] || 0), 0);
}
function split(words) {
  const ranked = [...words].sort((a, b) => hardness(a) - hardness(b) || (a < b ? -1 : 1));
  const h = Math.ceil(ranked.length / 2);
  return [ranked.slice(0, h), ranked.slice(h)];
}

// Order matters: common words first, so a rarer band never takes one.
const built = { MON: band(5, [10]), TUE: band(5, [20]) };
[built.WED, built.THU] = split(band(5, [35]));
const hard = HARD.filter((w) => !seen.has(w) && !BLOCK.has(w) && !EXCLUDE.has(w));
hard.forEach((w) => seen.add(w));
[built.FRI, built.SAT] = split(hard);
built.SUN = band(6, [10, 20]);
for (const w of Object.values(built).flat()) valid[w.length].add(w);

const BANDS = [
  // [name, what]: Monday the most common words, Saturday the rarest and trickiest, Sunday six letters.
  ['SUN', '6-letter words, SCOWL level 10+20 (common)'],
  ['MON', '5-letter words, SCOWL level 10 (most common)'],
  ['TUE', '5-letter words, SCOWL level 20'],
  ['WED', '5-letter words, SCOWL level 35, easier half by letter pattern'],
  ['THU', '5-letter words, SCOWL level 35, harder half by letter pattern'],
  ['FRI', '5-letter words, hand-picked from SCOWL 40-55, easier half by letter pattern'],
  ['SAT', '5-letter words, hand-picked from SCOWL 40-55, harder half by letter pattern'],
];
const wrap = (words) => words.join(' ').replace(/(.{1,110})(\s|$)/g, '  $1\n').trimEnd();
if (only !== 'valid') {
  let src = `// Today's answer comes from one band per weekday (site/js/daily.js). Generated by tools/build-words.mjs from SCOWL,
// then curated by hand. FROZEN: the order is the schedule. Never reorder or delete; only edit words of future days.
`;
  BANDS.forEach(([name, what], i) => {
    const words = shuffle(built[name], 0x1e77 + i);
    src += `\n// ${name}: ${words.length} ${what}\nexport const ${name} = \`\n${wrap(words)}\n\`.trim().split(/\\s+/);\n`;
    console.log(name, words.length);
  });
  fs.writeFileSync(path.join(OUT, 'answers.js'), src);
}
let vsrc = `// Every word accepted as a guess, from ENABLE (public domain) and SCOWL. Generated by tools/build-words.mjs.\n`;
for (const len of [5, 6]) { vsrc += `export const VALID${len} = '${[...valid[len]].sort().join('')}';\n`; console.log(`valid ${len}:`, valid[len].size); }
fs.writeFileSync(path.join(OUT, 'valid.js'), vsrc);
