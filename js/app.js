// Lettrle UI: intro -> six guesses -> result, share, leaderboard. Archive replays. Live progress to a Play together room.
import { EPOCH, MAX_GUESSES, addDays, dayNumber, emojiRow, fmtTime, hasPuzzle, isValid, marks, msUntilNextUtcDay, puzzle,
  roomScore, solvedMarks, todayKey } from './daily.js';
import * as api from './api.js';
import * as store from './storage.js';

const $ = (id) => document.getElementById(id);
const SITE = 'https://biccyanzac-pixel.github.io/lettrle/';
const M = () => window.JGG?.motion;
const IN_ROOM = window.parent !== window; // inside the jacob.gg/play lobby's iframe
if (IN_ROOM) document.documentElement.classList.add('in-room'); // compact: the lobby's bar and boards sit above

let mode = { day: todayKey(), archive: false };
let p = null;        // puzzle(mode.day)
let g = null;        // store.game(mode.day)
let typing = '';     // letters of the row being typed
let timerId = null;
let flushing = null; // the running send of unsent guesses, so only one runs at a time

function el(tag, props = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  }
  for (const c of children) if (c !== null && c !== undefined) n.append(c);
  return n;
}

const show = (id, on = true) => { $(id).hidden = !on; };
const pad = (n) => String(n).padStart(2, '0');
const isDone = () => store.finished(g, MAX_GUESSES);
const solved = () => g.marks.some(solvedMarks);
const playing = () => !!g?.startedAt && !isDone();
const save = () => store.save(mode.day, g);

function tickCountdown() {
  const s = Math.floor(msUntilNextUtcDay() / 1000);
  $('countdown').textContent = `Next in ${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
  // a new UTC day started: switch to it unless someone is mid-game
  if (!mode.archive && mode.day !== todayKey() && !playing()) { mode = { day: todayKey(), archive: false }; render(); }
}

// --- room (jacob.gg/play): colours only, never letters. See jacob.gg/docs/room-contract.md ---

function roomPost(type, extra = {}) {
  if (!IN_ROOM) return;
  const msg = { jgg: 'room', type, game: 'lettrle', day: mode.day, length: p.length, max: MAX_GUESSES,
    guesses: g.marks.length, rows: [...g.marks], ...extra };
  try { window.parent.postMessage(msg, location.origin); } catch { /* the lobby is optional */ }
}
const roomProgress = () => roomPost('progress', { p: g.marks.length / MAX_GUESSES });
const roomFinish = (already = false) => roomPost('finish', {
  solved: solved(), ms: g.ms ?? (g.finishedAt - g.startedAt), score: roomScore(solved(), g.marks.length), already });

// --- views ----------------------------------------------------------------------------------------

function render() {
  const { day } = mode;
  p = puzzle(day);
  g = store.game(day);
  typing = '';
  clearInterval(timerId);
  $('daynum').textContent = `Lettrle #${p.number}${g.late || (mode.archive && !isDone()) ? ` · ${day} (played later)` : ''}`;
  if (window.JGG) $('level').replaceChildren(JGG.levelChip(day));
  $('intro-title').textContent = p.length === 6 ? "Sunday special: a six-letter word" : "Guess the day's word";
  hideSyncError();
  if (isDone()) {
    show('intro', false); show('play', false);
    renderDone();
    show('done', true);
    roomFinish(true);
  } else if (g.startedAt) {
    show('intro', false); show('done', false);
    showPlay();
    flush();
  } else {
    show('done', false); show('play', false); show('intro', true);
    $('start-label').textContent = 'Start';
    const name = api.savedName();
    $('name').value = name;
    show('name-field', !name);
    hideError('start-error');
    if (window.JGG) JGG.playingAs({ mount: $('playing-as'), name, onChange: (n) => { api.saveName(n); $('name').value = n; } });
    else { $('playing-as').textContent = name ? `Playing as ${name}.` : ''; show('playing-as', !!name); }
  }
  renderBoard();
}

function begin() {
  g.startedAt = Date.now();
  g.late = mode.day !== todayKey();
  save();
  M() ? M().swap($('intro'), $('play')) : (show('intro', false), show('play', true));
  showPlay();
  roomProgress();
  flush();
}

function showPlay() {
  show('play', true);
  renderGrid();
  renderKeyboard();
  setMessage('');
  timerId = setInterval(tickTimer, 250);
  tickTimer();
}

function tickTimer() {
  if (!g?.startedAt) return;
  const end = isDone() ? (g.finishedAt ?? Date.now()) : Date.now();
  const s = Math.max(0, Math.floor((end - g.startedAt) / 1000));
  $('timer').textContent = `${Math.floor(s / 60)}:${pad(s % 60)}`;
}

const STATE_WORD = { g: 'right place', y: 'in the word', x: 'not in the word' };

function renderGrid() {
  const rows = [];
  for (let r = 0; r < MAX_GUESSES; r++) {
    const word = r < g.guesses.length ? g.guesses[r] : r === g.guesses.length ? typing : '';
    const mk = g.marks[r] || '';
    const tiles = [];
    for (let i = 0; i < p.length; i++) {
      const ch = word[i] || '';
      const st = mk[i] || '';
      tiles.push(el('div', { class: `tile${ch ? ' filled' : ''}`, 'data-state': st, role: 'gridcell',
        'aria-label': ch ? `${ch.toUpperCase()}${st ? `, ${STATE_WORD[st]}` : ''}` : 'empty' }, ch.toUpperCase()));
    }
    rows.push(el('div', { class: `grid-row${r === g.guesses.length && !isDone() ? ' current' : ''}`, role: 'row' }, ...tiles));
  }
  const grid = $('grid');
  grid.style.setProperty('--cols', p.length);
  grid.replaceChildren(...rows);
  $('play-label').textContent = `Guess ${Math.min(g.guesses.length + 1, MAX_GUESSES)} of ${MAX_GUESSES}`;
}

const KEY_ROWS = ['qwertyuiop', 'asdfghjkl', '+zxcvbnm-'];
function letterStates() {
  const rank = { g: 3, y: 2, x: 1 };
  const out = {};
  g.guesses.forEach((w, r) => [...w].forEach((c, i) => {
    const s = g.marks[r][i];
    if (!out[c] || rank[s] > rank[out[c]]) out[c] = s;
  }));
  return out;
}

function renderKeyboard() {
  const st = letterStates();
  $('keyboard').replaceChildren(...KEY_ROWS.map((row) => el('div', { class: 'kb-row' }, ...[...row].map((k) => {
    if (k === '+') return el('button', { type: 'button', class: 'key wide', 'data-key': 'Enter', text: 'Enter' });
    if (k === '-') return el('button', { type: 'button', class: 'key wide', 'data-key': 'Backspace', 'aria-label': 'Delete', text: '⌫' });
    return el('button', { type: 'button', class: 'key', 'data-key': k, 'data-state': st[k] || '',
      'aria-label': `${k.toUpperCase()}${st[k] ? `, ${STATE_WORD[st[k]]}` : ''}`, text: k.toUpperCase() });
  }))));
}

function setMessage(text) { $('message').textContent = text; }

// --- input ----------------------------------------------------------------------------------------

function press(key) {
  if (!playing() || $('play').hidden) return;
  if (key === 'Enter') return submitGuess();
  if (key === 'Backspace') { typing = typing.slice(0, -1); setMessage(''); return renderGrid(); }
  if (/^[a-z]$/i.test(key) && typing.length < p.length) { typing += key.toLowerCase(); setMessage(''); renderGrid(); }
}

function submitGuess() {
  if (typing.length < p.length) return setMessage(`Not enough letters: today's word has ${p.length}.`);
  if (!isValid(typing)) return setMessage(`"${typing.toUpperCase()}" isn't in the word list.`);
  const word = typing;
  g.guesses.push(word);
  g.marks.push(marks(word, p.word));
  typing = '';
  const over = isDone();
  if (over) g.finishedAt = Date.now();
  save();
  renderGrid();
  renderKeyboard();
  setMessage('');
  if (over) finish();
  else roomProgress();
  flush();
}

function finish() {
  clearInterval(timerId);
  tickTimer();
  roomProgress();
  roomFinish(false);
  renderDone();
  M() ? M().swap($('play'), $('done')) : (show('play', false), show('done', true));
  M()?.scroll($('card'), { block: 'start' });
}

// --- leaderboard sync: send the guesses the server doesn't have yet, in order -------------------

/**
 * Take the server's game when it knows more than this browser (played on another device) or disagrees.
 * Returns true if this browser's guesses were replaced.
 */
function adopt(state) {
  if (!state) return false;
  const local = g.guesses.join(',');
  const remote = state.guesses.join(',');
  const replace = state.guesses.length > 0 && !(local + ',').startsWith(remote + ',');
  if (replace) {
    g.guesses = [...state.guesses]; g.marks = [...state.marks];
    if (state.finished && !g.finishedAt) g.finishedAt = Date.now();
  }
  g.sent = Math.min(state.guesses.length, g.guesses.length);
  if (state.finished) g.ms = state.ms;
  g.late = state.late;
  save();
  return replace;
}

function flush() {
  if (!api.enabled() || !g?.startedAt) return Promise.resolve();
  if (flushing) return flushing;
  const day = mode.day;
  flushing = (async () => {
    try {
      const name = api.savedName();
      const state = await api.start(day, name);
      if (mode.day !== day) return;
      if (adopt(state)) { render(); return; } // the server had a different game: show that one
      while (g.sent < g.guesses.length) {
        const i = g.sent;
        try {
          const r = await api.guess(day, i, g.guesses[i]);
          if (mode.day !== day) return;
          g.sent = i + 1;
          if (r.finished) g.ms = r.ms;
          save();
        } catch (e) {
          if (e.state && ['already', 'out_of_order', 'finished'].includes(e.code)) { adopt(e.state); render(); return; }
          throw e;
        }
      }
      hideSyncError();
      if (isDone()) { renderDoneTime(); renderBoard(); }
    } catch (e) {
      if (mode.day === day) showSyncError(`Couldn't reach the leaderboard: ${e.message}`);
    } finally { flushing = null; }
  })();
  return flushing;
}

function showSyncError(msg) { $('sync-error-text').textContent = msg; show('sync-error', true); }
function hideSyncError() { show('sync-error', false); }

// --- result ---------------------------------------------------------------------------------------

function renderDoneTime() {
  const won = solved();
  const time = g.ms ?? (g.finishedAt - g.startedAt);
  $('done-sub').textContent = won
    ? `Solved in ${g.marks.length} ${g.marks.length === 1 ? 'guess' : 'guesses'} · ${fmtTime(time)}`
    : `Not this time · ${fmtTime(time)}`;
}

function renderDone() {
  const won = solved();
  $('daily-score-caption').textContent = g.late ? `Your replay of ${mode.day}` : "Today's result";
  const sc = $('daily-score');
  sc.textContent = `${won ? g.marks.length : 'X'}/${MAX_GUESSES}`;
  sc.className = `score ${won ? 'good' : 'bad'}`;
  renderDoneTime();
  $('answer-reveal').replaceChildren(won ? 'The word: ' : 'The word was ',
    el('a', { href: `https://en.wiktionary.org/wiki/${p.word}`, target: '_blank', rel: 'noopener', text: p.word.toUpperCase() }));
  const grid = $('done-grid');
  grid.style.setProperty('--cols', p.length);
  grid.replaceChildren(...g.marks.map((m, i) => el('div', { class: 'grid-row jgg-reveal', style: `--jgg-i: ${i}` },
    ...[...m].map((s) => el('div', { class: 'tile', 'data-state': s })))));
  $('room-score').textContent = String(roomScore(won, g.marks.length));
  $('come-back').textContent = mode.day === todayKey() ? 'Come back tomorrow for a new word.' : 'Today\'s word is waiting too.';
  show('share-done', false);
  window.JGG?.rate({ game: 'lettrle', day: mode.day, mount: $('rate') });
}

function shareText() {
  const won = solved();
  const streak = g.late ? 0 : store.streak(todayKey(), addDays);
  const time = g.ms ?? (g.finishedAt - g.startedAt);
  return `Lettrle #${p.number}${g.late ? ' (replay)' : ''} ${won ? g.marks.length : 'X'}/${MAX_GUESSES} · ${fmtTime(time)}` +
    `${streak > 1 ? `  🔥${streak}` : ''}\n${g.marks.map(emojiRow).join('\n')}\n${SITE}`;
}

async function share() {
  const text = shareText();
  try {
    if (navigator.share && matchMedia('(pointer: coarse)').matches) { await navigator.share({ text }); return; }
    await navigator.clipboard.writeText(text);
    show('share-done', true);
  } catch (e) {
    if (e?.name !== 'AbortError') prompt('Copy your result:', text);
  }
}

// --- leaderboard ----------------------------------------------------------------------------------

function miniGrid(rows, len) {
  return el('span', { class: 'mini', style: `--cols: ${len}`, 'aria-hidden': 'true' },
    ...rows.flatMap((m) => [...m].map((s) => el('i', { 'data-state': s }))));
}

async function renderBoard() {
  if (!api.enabled()) { show('board', false); return; }
  const day = mode.day;
  const late = mode.archive && !(isDone() && !g.late);
  show('board', true);
  $('board').querySelector('h2').textContent = late ? `Played later: ${day}` : day === todayKey() ? "Today's leaderboard" : `Leaderboard: ${day}`;
  let b;
  try { b = await api.board(day, late); }
  catch (e) { $('board-note').textContent = `Leaderboard unavailable: ${e.message}`; show('board-note', true); return; }
  if (mode.day !== day) return;
  show('board-note', false);
  const players = b.players ?? 0;
  $('players').textContent = players ? `${b.finished ?? 0} of ${players} finished` : '';
  const rows = [...(b.top || [])];
  if (b.you) rows.push(null, b.you);
  $('rows').replaceChildren(...rows.map((r) => r === null ? el('li', { class: 'row-gap', text: '···' })
    : el('li', { class: `row${r.you ? ' me' : ''}` },
      el('span', { class: 'row-rank', text: `${r.rank ?? ''}` }),
      el('div', { class: 'row-main' },
        el('div', { class: 'row-name', dir: 'auto', text: r.name ?? '?' }),
        el('div', { class: 'row-sub' }, miniGrid(r.marks || [], p.length), ` ${fmtTime(r.ms)}`)),
      el('span', { class: 'row-score', text: `${r.solved ? r.guesses : 'X'}/${MAX_GUESSES}` }))));
  show('board-empty', !(b.top || []).length);
}

// --- archive --------------------------------------------------------------------------------------

async function browseArchive() {
  const list = $('archive-list');
  if (!list.hidden) { list.hidden = true; return; }
  const today = todayKey();
  const items = [];
  for (let d = addDays(today, -1); d >= EPOCH; d = addDays(d, -1)) items.push(d);
  let summary = {};
  try { if (api.enabled() && items.length) summary = (await api.days(items[items.length - 1], items[0])).days || {}; }
  catch { /* the list works without counts */ }
  list.replaceChildren(...(items.length ? items.map((d) => {
    const s = summary[d];
    const mine = store.game(d);
    const done = store.finished(mine, MAX_GUESSES);
    const won = mine.marks.some(solvedMarks);
    return el('li', {}, el('button', { class: 'archive-list-item', type: 'button', onclick: () => openArchive(d) },
      el('span', { class: 'archive-list-day', text: `Lettrle #${dayNumber(d)} · ${d}` }),
      el('span', { class: 'archive-list-prompt', text: [
        s?.players ? `${s.players} played on the day${s.best ? `, best ${s.best}/${MAX_GUESSES}` : ''}` : 'Nobody played on the day',
        done ? `you: ${won ? mine.marks.length : 'X'}/${MAX_GUESSES}` : mine.startedAt ? 'you: in progress' : null].filter(Boolean).join(' · ') })));
  }) : [el('li', { class: 'archive-list-empty', text: 'No past days yet. Lettrle started today.' })]));
  list.hidden = false;
}

function openArchive(d) {
  mode = { day: d, archive: d !== todayKey() };
  $('archive-list').hidden = true;
  render();
  M()?.scroll($('card'), { block: 'start' });
}

// --- errors ---------------------------------------------------------------------------------------

function showError(id, msg) { $(id).textContent = msg; show(id, true); }
function hideError(id) { show(id, false); }

// --- boot -----------------------------------------------------------------------------------------

$('start-form').addEventListener('submit', (e) => {
  e.preventDefault();
  hideError('start-error');
  const name = ($('name').value || api.savedName()).replace(/\s+/g, ' ').trim();
  if (!name) { showError('start-error', 'Enter a name for the leaderboard.'); return; }
  api.saveName(name.slice(0, 20));
  begin();
});
$('keyboard').addEventListener('mousedown', (e) => e.preventDefault()); // keys never take focus, so Enter can't re-press one
$('keyboard').addEventListener('click', (e) => { const k = e.target.closest('[data-key]'); if (k) press(k.dataset.key); });
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey || e.target.closest?.('input, textarea, select')) return;
  if (e.key === 'Enter' && e.target.closest?.('button') && !e.target.closest('#keyboard')) return; // let buttons work
  if (!playing() || $('play').hidden) return;
  if (e.key === 'Enter' || e.key === 'Backspace' || /^[a-z]$/i.test(e.key)) { e.preventDefault(); press(e.key); }
});
$('retry').addEventListener('click', () => { hideSyncError(); flush(); });
$('share').addEventListener('click', share);
$('archive-browse').addEventListener('click', browseArchive);

(async function boot() {
  await api.loadConfig();
  const q = new URLSearchParams(location.search).get('day');
  if (q && hasPuzzle(q) && q < todayKey()) openArchive(q);
  else render();
  tickCountdown();
  setInterval(tickCountdown, 1000);
})();
