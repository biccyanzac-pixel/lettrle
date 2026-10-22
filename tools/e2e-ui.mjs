// Browser end-to-end: plays today's word in headless Chrome against a local worker, phone + desktop sizes, and checks
// the Play together messages from inside an iframe.
//   cd worker && rm -rf .wrangler && npm run db:init:local && npm run dev:local     (in another terminal)
//   jacob.gg hub worker on 8831 for the rating box (see ../jacob.gg/CLAUDE.md), or HUB=off
//   node tools/e2e-ui.mjs
import fs from 'node:fs';
import { chromium } from 'playwright-core';
import { serve } from './serve.mjs';
import { MIN_MS, isValid, marks, puzzle, todayKey } from '../site/js/daily.js';

const API = process.env.API || 'http://127.0.0.1:8851';
const HUB = process.env.HUB || 'http://127.0.0.1:8831';
const SITE = 'http://localhost:8085/';
const today = todayKey();
const { word, length } = puzzle(today);
const wrong = (length === 5 ? ['crane', 'pious', 'dwarf', 'lymph'] : ['planet', 'rhythm', 'jockey', 'muffin']).filter((w) => w !== word && isValid(w));
fs.mkdirSync(new URL('./results/', import.meta.url), { recursive: true });
const shot = (pg, name, full = true) => pg.screenshot({ path: `tools/results/${name}.png`, fullPage: full });

const srv = await serve(8085);
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
let failures = 0;
const check = (label, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  ' + detail : ''}`); if (!ok) failures++; };
const qs = `?api=${encodeURIComponent(API)}&hub=${encodeURIComponent(HUB)}`;
const tiles = (pg, row) => pg.$$eval(`#grid .grid-row:nth-child(${row}) .tile`, (ts) => ts.map((t) => t.dataset.state).join(''));

// --- phone: a full game -------------------------------------------------------------------------------
const page = await browser.newPage({ viewport: { width: 360, height: 760 }, deviceScaleFactor: 2, hasTouch: true });
const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(SITE + qs);
await page.waitForSelector('#daynum:has-text("Lettrle #")');
check('day number shown', (await page.textContent('#daynum')).includes(`#${puzzle(today).number}`));
check('weekday level shown (jacob.gg kit)', /·|Sunday special/.test(await page.textContent('#level')));
await shot(page, '1-intro-phone');
await page.fill('#name', 'Tester');
await page.click('#start');
await page.waitForSelector('#play:not([hidden]) #grid .tile');
check(`grid is 6 × ${length}`, (await page.$$('#grid .tile')).length === 6 * length);

// a non-word, typed on the physical keyboard
await page.keyboard.type('zzzzzz'.slice(0, length));
await page.keyboard.press('Enter');
check('a non-word is refused with a message', (await page.textContent('#message')).includes('word list') && (await tiles(page, 1)) === '');
for (let i = 0; i < length; i++) await page.keyboard.press('Backspace');
await page.keyboard.press('Enter');
check('too short is refused', (await page.textContent('#message')).includes('Not enough'));

// a real wrong word, on the on-screen keyboard
for (const c of wrong[0]) await page.click(`#keyboard [data-key="${c}"]`);
await page.click('#keyboard [data-key="Enter"]');
check('guess coloured like the server would', (await tiles(page, 1)) === marks(wrong[0], word), await tiles(page, 1));
const keyState = await page.getAttribute(`#keyboard [data-key="${wrong[0][0]}"]`, 'data-state');
check('keyboard shows letter colours', ['g', 'y', 'x'].includes(keyState), keyState);
await shot(page, '2-play-phone');
await page.waitForTimeout(MIN_MS + 300); // the worker refuses solves faster than this
await page.keyboard.type(word);
await page.keyboard.press('Enter');
await page.waitForSelector('#done:not([hidden])');
check('result 2/6', (await page.textContent('#daily-score')) === '2/6');
check('word revealed at the end', (await page.textContent('#answer-reveal')).toLowerCase().includes(word));
check('room score element = 5', (await page.textContent('#room-score')) === '5');
await page.waitForFunction(() => /Solved in 2 guesses · \d/.test(document.querySelector('#done-sub').textContent));
await page.waitForFunction(() => [...document.querySelectorAll('#rows .row')].some((r) => r.textContent.includes('Tester')), null, { timeout: 8000 }).catch(() => {});
const board = await page.$$eval('#rows .row', (rs) => rs.map((r) => r.textContent));
check('leaderboard lists the player with 2/6', board.some((t) => t.includes('Tester') && t.includes('2/6')), JSON.stringify(board));
check('no sync error', await page.isHidden('#sync-error'));
const mine = (await page.textContent('#rows .row.me').catch(() => '')) || '';
const serverTime = (mine.match(/(\d+\.\d) s/) || [])[1];
check('result shows the server-timed time', !!serverTime && (await page.textContent('#done-sub')).includes(`${serverTime} s`), `${serverTime} vs ${await page.textContent('#done-sub')}`);
await shot(page, '3-done-phone');
if (HUB !== 'off') {
  await page.waitForSelector('#rate .jgg-rate', { timeout: 8000 }).catch(() => {});
  const rated = await page.$('#rate .jgg-rate');
  check('rating box shown', !!rated);
  if (rated) {
    await page.focus('#rate .jgg-stars');
    await page.keyboard.press('End');
    await page.click('#rate .jgg-rate-send');
    await page.waitForFunction(() => document.querySelector('#rate .jgg-rate-note').textContent.startsWith('Thanks'), null, { timeout: 8000 })
      .then(() => check('rating sent to the hub', true), () => check('rating sent to the hub', false));
  }
}
await page.reload();
await page.waitForSelector('#done:not([hidden])');
check('finished state survives a reload', (await page.textContent('#daily-score')) === '2/6');
await page.click('#archive-browse');
await page.waitForSelector('#archive-list:not([hidden])');
check('archive opens', (await page.textContent('#archive-list')).length > 0);
const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
check('no horizontal scroll at 360 px', scrollW <= 360, String(scrollW));

// --- Play together: the game inside an iframe posts colours, never letters -------------------------------
const room = await browser.newPage({ viewport: { width: 390, height: 844 } });
room.on('pageerror', (e) => errors.push(e.message));
await room.route(SITE + '__room.html', (r) => r.fulfill({ contentType: 'text/html', body:
  `<!doctype html><script>window.msgs=[];addEventListener('message',(e)=>{if(e.origin===location.origin&&e.data?.jgg==='room')msgs.push(e.data)});</script>
   <iframe id="f" style="width:380px;height:800px" src="./?api=off&hub=off"></iframe>` }));
await room.goto(SITE + '__room.html');
const frame = await (await room.waitForSelector('#f')).contentFrame();
await frame.waitForSelector('#daynum:has-text("Lettrle #")');
await frame.fill('#name', 'Roomie');
await frame.click('#start');
await frame.waitForSelector('#play:not([hidden])');
for (const w of [wrong[1], wrong[2]]) { for (const c of w) await frame.click(`#keyboard [data-key="${c}"]`); await frame.click('#keyboard [data-key="Enter"]'); }
for (const c of word) await frame.click(`#keyboard [data-key="${c}"]`);
await frame.click('#keyboard [data-key="Enter"]');
await frame.waitForSelector('#done:not([hidden])');
const msgs = await room.evaluate(() => window.msgs);
const progress = msgs.filter((m) => m.type === 'progress');
const fin = msgs.find((m) => m.type === 'finish');
check('room: progress after start and each guess', progress.length >= 4 && progress.at(-1).guesses === 3, JSON.stringify(progress.map((m) => m.guesses)));
check('room: rows are colours only', progress.every((m) => m.rows.every((r) => /^[gyx]+$/.test(r))) && progress.at(-1).rows[2] === 'g'.repeat(length));
const letters = new RegExp(`${wrong[1]}|${wrong[2]}|${word}`, 'i');
check('room: no message carries a guessed word', !msgs.some((m) => letters.test(JSON.stringify(m))), JSON.stringify(msgs.at(-1)));
check('room: finish has score 4 for a 3-guess solve', fin && fin.solved === true && fin.guesses === 3 && fin.score === 4 && fin.game === 'lettrle' && fin.already === false, JSON.stringify(fin));
check('room: lobby selectors (#done visible, #room-score) read 4', (await frame.textContent('#room-score')) === '4' && await frame.isVisible('#done'));

// --- desktop, light theme, storage blocked --------------------------------------------------------------
const desk = await browser.newPage({ viewport: { width: 1280, height: 900 }, colorScheme: 'light' });
desk.on('pageerror', (e) => errors.push(e.message));
await desk.goto(SITE + qs);
await desk.waitForSelector('#daynum:has-text("Lettrle #")');
await shot(desk, '4-done-desktop-light', false);

const ctx = await browser.newContext({ viewport: { width: 360, height: 740 } });
await ctx.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); });
const blocked = await ctx.newPage();
const blockedErrors = []; blocked.on('pageerror', (e) => blockedErrors.push(e.message));
await blocked.goto(SITE + '?api=off&hub=off');
await blocked.waitForSelector('#daynum:has-text("Lettrle #")');
await blocked.fill('#name', 'NoStorage');
await blocked.click('#start');
await blocked.waitForSelector('#play:not([hidden])');
await blocked.keyboard.type(wrong[0]);
await blocked.keyboard.press('Enter');
check('works with localStorage blocked', blockedErrors.length === 0 && (await blocked.$$eval('#grid .tile[data-state]:not([data-state=""])', (t) => t.length)) === length, blockedErrors.join(' | '));
await shot(blocked, '5-play-phone-dark');

check('no page errors', errors.length === 0, errors.join(' | '));
await browser.close(); srv.close();
console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
