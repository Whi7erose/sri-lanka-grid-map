import fs from 'node:fs';
import assert from 'node:assert/strict';
import { parseCsv, mergeDays, findDips, K, addDays } from './fetch_pucsl.mjs';
const d = JSON.parse(fs.readFileSync('data/pucsl.json','utf8'));
// 1. CSV in the portal's format (quoted thousands, Data N/A, renamed columns)
const csv = `Date (GMT+5:30),Solar (Energy in GWh/day),Rooftop Solar (Est.) (Energy in GWh/day),Mini Hydro (Telemetered) (Energy in GWh/day),Mini Hydro (Estimated) (Energy in GWh/day),Biomass and Waste Heat (Energy in GWh/day),Wind (Energy in GWh/day),BESS (Energy in GWh/day),Major Hydro (Energy in GWh/day),Oil (IPP) (Energy in GWh/day),Oil (CEB) (Energy in GWh/day),Coal (Energy in GWh/day)
2026-10-27,1.10,9.80,4.50,0.40,0.35,1.20,0.02,"1,021.50",0.30,2.00,15.90
2026-10-28,Data N/A,Data N/A,Data N/A,Data N/A,Data N/A,Data N/A,Data N/A,Data N/A,Data N/A,Data N/A,Data N/A`;
const { days, unknown } = parseCsv(csv);
assert.deepEqual(unknown, []);
assert.deepEqual(days['2026-10-27'], [15.9, 2.3, 1021.5, 4.9, 1.2, 1.1, 9.8, 0.4, 0]);   // coal, oil, hydro, mini, wind, solar, roof, bio, bess (bess 0.02 rounds to 0)
assert.equal(days['2026-10-28'], null);
// 2. merge into a copy: Oct 2026 had 26 days; day 27 appended, 28 stored as zeros (no data)
const c = JSON.parse(JSON.stringify(d));
const w = mergeDays(c, days);
assert.deepEqual(w, ['2026-10-27','2026-10-28']);
const oct = c.daily['2026-10'].split('|');
assert.equal(oct.length, 28);
assert.equal(oct[26], '15.9 2.3 1021.5 4.9 1.2 1.1 9.8 0.4 0');
const row = c.months.find(r => r[0] === '2026-10');
const expCoal = Math.round(oct.reduce((a,s)=>a+ +s.split(' ')[0],0)*10)/10;
assert.equal(row[2], expCoal); assert.equal(row[1], 0);   // partial month flagged
// 3. new month creates a row in order
mergeDays(c, {'2026-11-01':[10,1,15,3,1,1,8,0.3,0]});
assert.equal(c.months[c.months.length-1][0], '2026-11');
// 4. re-merging the same day is idempotent
const before = c.daily['2026-10']; mergeDays(c, {'2026-10-27': days['2026-10-27']}); assert.equal(c.daily['2026-10'], before);
// 5. dip detection on the real history: which days would have alerted?
const dates = []; for (let x = '2025-01-15'; x <= '2026-10-26'; x = addDays(x,1)) dates.push(x);
const dips = findDips(d, dates);
console.log('dips flagged:', dips.map(a => `${a.date} ${a.totalGWh}/${a.medianGWh}`).join(' | '));
assert.ok(dips.some(a => a.date === '2025-02-09')); assert.ok(dips.some(a => a.date === '2026-10-17'));
console.log('all logic tests passed');
