// Daily updater for the Sri Lanka Grid Flow Map.
// Opens the PUCSL Electricity Dispatch Data portal in a headless browser, exports the
// daily generation-by-source CSV for the days we don't have yet, and merges them into
// data/pucsl.json and data/pucsl.js (the file the website loads).
//
// Run: node scripts/fetch_pucsl.mjs            (fetches from the last stored day to yesterday)
//      FROM=2026-10-01 TO=2026-10-26 node scripts/fetch_pucsl.mjs   (re-fetch a range)

import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

export const K = ['coal', 'oil', 'hydro', 'mini', 'wind', 'solar', 'roof', 'bio', 'bess'];
const PORTAL = 'https://gendata.pucsl.gov.lk/generation-profile';
const DATA_JSON = 'data/pucsl.json';
const DATA_JS = 'data/pucsl.js';
const ALERTS = 'data/alerts.json';
const REFETCH_DAYS = 3;          // the portal sometimes revises the most recent days
const MAX_DAYS_PER_RUN = 120;    // safety limit for back-fills

const pad = n => String(n).padStart(2, '0');
export const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const daysInMonth = ym => new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7), 0)).getUTCDate();
const colomboNow = () => new Date(Date.now() + 5.5 * 3600e3);
const r1 = x => Math.round(x * 10) / 10;

// Map a portal column name to one of our source keys.
export function keyFor(name) {
  const n = name.replace(/\s*\(Energy in [^)]*\)/, '').trim().toLowerCase();
  if (n.startsWith('coal')) return 'coal';
  if (n.startsWith('oil')) return 'oil';
  if (n === 'major hydro') return 'hydro';
  if (n.startsWith('mini hydro')) return 'mini';
  if (n === 'wind') return 'wind';
  if (n.startsWith('rooftop') || n === 'solar (estimated)') return 'roof';
  if (n === 'solar' || n === 'ncre' || n.startsWith('ground')) return 'solar';
  if (n.startsWith('biomass')) return 'bio';
  if (n.startsWith('bess') || n.includes('battery')) return 'bess';
  return null;
}

function splitCsvLine(line) {
  const out = []; let cur = '', q = false;
  for (const ch of line) { if (ch === '"') { q = !q; continue; } if (ch === ',' && !q) { out.push(cur); cur = ''; } else cur += ch; }
  out.push(cur); return out;
}

// Parse the portal's CSV export into {date: [values in K order] | null}. null = no data that day.
export function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const head = splitCsvLine(lines[0]).slice(1).map(keyFor);
  const unknown = splitCsvLine(lines[0]).slice(1).filter((h, i) => !head[i]);
  const days = {};
  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line); const date = cells[0].slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const v = Object.fromEntries(K.map(k => [k, 0])); let any = false;
    cells.slice(1).forEach((c, i) => { const k = head[i]; const x = parseFloat(c.replace(/,/g, '')); if (!k || isNaN(x)) return; v[k] += x; any = true; });
    days[date] = any ? K.map(k => r1(v[k])) : null;
  }
  return { days, unknown };
}

// Merge parsed days into the dataset (mutates d). Returns list of dates written.
export function mergeDays(d, days) {
  const written = [];
  for (const [date, vals] of Object.entries(days).sort()) {
    const ym = date.slice(0, 7), di = +date.slice(8, 10) - 1;
    const arr = d.daily[ym] ? d.daily[ym].split('|') : [];
    while (arr.length < di) arr.push(K.map(() => 0).join(' '));     // fill gaps with "no data"
    arr[di] = (vals || K.map(() => 0)).join(' ');
    d.daily[ym] = arr.join('|'); written.push(date);
  }
  for (const ym of new Set(written.map(x => x.slice(0, 7)))) {
    const days = d.daily[ym].split('|').map(s => s.split(' ').map(Number));
    const sums = K.map((k, i) => r1(days.reduce((a, v) => a + v[i], 0)));
    const ok = days.length === daysInMonth(ym) && days.every(v => v.some(x => x > 0)) ? 1 : 0;
    const row = [ym, ok, ...sums], at = d.months.findIndex(r => r[0] === ym);
    if (at >= 0) d.months[at] = row; else { d.months.push(row); d.months.sort((a, b) => a[0] < b[0] ? -1 : 1); }
  }
  return written;
}

// Flag likely blackouts: total output well below the previous 14 days AND coal collapsing the
// same or next day (every island-wide blackout since 2020 tripped the Lakvijaya coal units).
export function findDips(d, dates) {
  const tot = {}, coal = {};
  for (const [m, s] of Object.entries(d.daily)) s.split('|').forEach((x, i) => { const v = x.split(' ').map(Number); const k = `${m}-${pad(i + 1)}`; tot[k] = v.reduce((a, b) => a + b, 0); coal[k] = v[0]; });
  const median = a => { const b = a.filter(x => x > 0).sort((p, q) => p - q); return b.length ? b[Math.floor(b.length / 2)] : 0; };
  const alerts = [];
  for (const date of dates) {
    if (!(tot[date] > 0)) continue;
    const prevT = [], prevC = []; for (let i = 1; i <= 14; i++) { const k = addDays(date, -i); if (tot[k] > 0) { prevT.push(tot[k]); prevC.push(coal[k]); } }
    if (prevT.length < 7) continue;
    const mT = median(prevT), mC = median(prevC);
    const coalLow = Math.min(coal[date] ?? Infinity, coal[addDays(date, 1)] ?? Infinity);
    if (tot[date] < 0.82 * mT && mC > 3 && coalLow < 0.55 * mC)
      alerts.push({ date, totalGWh: r1(tot[date]), medianGWh: r1(mT), coalGWh: r1(coal[date]), note: 'Total generation well below normal and coal output collapsed: possible island-wide blackout.' });
  }
  return alerts;
}

// Runs inside the portal page: set the daily date range, press Export CSV, return the CSV text.
async function exportInPage({ y, mi, d1, d2 }) {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const MN = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const rx = /\w{3}\s\d{1,2},\s\d{4}\s-\s\w{3}\s\d{1,2},\s\d{4}/;
  if (document.querySelectorAll('select').length < 2) {
    const op = [...document.querySelectorAll('button')].find(b => rx.test(b.textContent));
    if (!op) throw new Error('date range button not found'); op.click(); await sleep(800);
  }
  const [ms, ys] = document.querySelectorAll('select');
  const setv = (s, v) => { Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, String(v)); s.dispatchEvent(new Event('change', { bubbles: true })); };
  setv(ys, y); await sleep(400); setv(ms, mi); await sleep(600);
  const pick = d => [...document.querySelectorAll('.react-datepicker__day')].find(e => new RegExp(MN[mi] + ' ' + d + '(st|nd|rd|th), ' + y).test(e.getAttribute('aria-label') || ''));
  const ok = e => e && !/--disabled/.test(e.className) && e.getAttribute('aria-disabled') !== 'true';
  let last = d2; while (last > d1 && !ok(pick(last))) last--;            // the newest days may not be selectable yet
  const a = pick(d1), b = pick(last); if (!ok(a) || !b) throw new Error(`day cell not available for ${y}-${mi + 1} ${d1}-${d2}`);
  a.click(); await sleep(300); b.click(); await sleep(300);
  const done = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Done'); if (done) done.click();
  await sleep(9000);
  const n0 = window.__csv.length;
  const ex = [...document.querySelectorAll('button')].find(x => x.textContent.trim().startsWith('Export'));
  if (!ex) throw new Error('Export button not found');
  ex.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'mouse' })); await sleep(200); ex.click(); await sleep(1000);
  const it = [...document.querySelectorAll('[role=menuitem]')].find(e => e.textContent.includes('Export CSV'));
  if (!it) throw new Error('Export CSV menu item not found');
  it.click();
  for (let i = 0; i < 20 && window.__csv.length === n0; i++) await sleep(250);
  if (window.__csv.length === n0) throw new Error('no CSV captured');
  return window.__csv[window.__csv.length - 1];
}

// Captures the CSV the page builds, instead of letting it download.
function captureDownloads() {
  window.__csv = [];
  const oc = URL.createObjectURL;
  URL.createObjectURL = function (blob) { try { blob.text().then(t => window.__csv.push(t)); } catch (e) {} return oc.call(URL, blob); };
  const ac = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () { if (/^(blob:|data:)/.test(this.href)) { if (this.href.startsWith('data:')) window.__csv.push(decodeURIComponent(this.href.split(',')[1] || '')); return; } return ac.call(this); };
}

function monthSegments(from, to) {
  const segs = []; let cur = from;
  while (cur <= to) {
    const ym = cur.slice(0, 7), last = `${ym}-${pad(daysInMonth(ym))}`, end = last < to ? last : to;
    segs.push({ y: +cur.slice(0, 4), mi: +cur.slice(5, 7) - 1, d1: +cur.slice(8, 10), d2: +end.slice(8, 10) });
    cur = addDays(end, 1);
  }
  return segs;
}

async function main() {
  const d = JSON.parse(fs.readFileSync(DATA_JSON, 'utf8'));
  const stored = Object.keys(d.daily).filter(m => m >= '2025-01').sort();
  const lastM = stored[stored.length - 1], lastDay = `${lastM}-${pad(d.daily[lastM].split('|').length)}`;
  const yesterday = addDays(colomboNow().toISOString().slice(0, 10), -1);
  let from = process.env.FROM || addDays(lastDay, -(REFETCH_DAYS - 1));
  const to = process.env.TO || yesterday;
  if (from > to) { console.log('Nothing to fetch.'); return; }
  if (addDays(from, MAX_DAYS_PER_RUN) < to) from = addDays(to, -MAX_DAYS_PER_RUN);
  console.log(`Fetching ${from} to ${to}`);

  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ timezoneId: 'Asia/Colombo', locale: 'en-US', viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(captureDownloads);
  const page = await ctx.newPage();
  await page.goto(PORTAL, { waitUntil: 'networkidle', timeout: 120000 });
  await page.getByRole('button', { name: '1D', exact: true }).click();
  await page.waitForTimeout(6000);

  let written = [], failures = 0;
  for (const seg of monthSegments(from, to)) {
    const label = `${seg.y}-${pad(seg.mi + 1)} days ${seg.d1}-${seg.d2}`;
    try {
      const csv = await page.evaluate(exportInPage, seg);
      const { days, unknown } = parseCsv(csv);
      if (unknown.length) console.warn(`  new columns not mapped: ${unknown.join(', ')}`);
      const got = mergeDays(d, days); written = written.concat(got);
      console.log(`  ${label}: ${got.length} days`);
    } catch (e) { failures++; console.error(`  ${label}: FAILED ${e.message}`); }
  }
  await browser.close();
  if (!written.length) { console.error('No data written.'); process.exit(failures ? 1 : 0); }

  const now = colomboNow();
  d.updated = `${now.getUTCDate()} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][now.getUTCMonth()]} ${now.getUTCFullYear()}`;
  fs.writeFileSync(DATA_JSON, JSON.stringify(d));
  fs.writeFileSync(DATA_JS, 'window.PUC_DATA = ' + JSON.stringify(d) + ';\n');

  const dips = findDips(d, written);
  if (dips.length) {
    const old = fs.existsSync(ALERTS) ? JSON.parse(fs.readFileSync(ALERTS, 'utf8')) : [];
    const seen = new Set(old.map(a => a.date)); const fresh = dips.filter(a => !seen.has(a.date));
    fs.writeFileSync(ALERTS, JSON.stringify(old.concat(fresh), null, 2));
    if (fresh.length && process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `dips=${fresh.map(a => a.date).join(',')}\n`);
    fresh.forEach(a => console.log(`  ALERT ${a.date}: ${a.totalGWh} GWh vs median ${a.medianGWh} GWh`));
  }
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `Fetched ${written.length} days (${written[0]} to ${written[written.length - 1]}). Failures: ${failures}. Possible blackouts: ${dips.map(a => a.date).join(', ') || 'none'}.\n`);
  if (failures) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main().catch(e => { console.error(e); process.exit(1); });
