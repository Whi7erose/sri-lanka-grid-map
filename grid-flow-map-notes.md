# Sri Lanka Grid Flow Map: build notes (27 Oct 2026)

Artifact: https://claude.ai/artifact/GmXNUg758B3ZobkhypVjwv

## Data provenance
- NTNSP My Maps export (mid=1xr4HzUvarqrAStfSf9HyufbT76vg454): only the first ~90k characters could be read. Captured: Head Office, all 24 segments in the 220 kV folder, 48 substations (up to Galle), ~60 of the 132 kV lines.
- Not captured, added from public knowledge with approximate positions (shown dashed or marked ≈): Deniyaya and later substations, the remaining 132 kV lines (north, east, south, Kurunegala, Puttalam), the Colombo 132 kV underground cables (10 representative ones; the original has 16), Maho GS.
- Switchyards and junctions (Kotmale, Victoria, Biyagama, Padukka, Veyangoda, and others) are line endpoints in the export; names were added.

## Energy storage layer (updated 27 Oct 2026)
- **Connected:** Anuradhapura (old Anuradhapura GS), 10 MW / 40 MWh, 18 Sep 2026. Built by WindForce and Vidullanka through StoreX. 4-hour battery.
- **Being built, 2025 programme (160 MW / 640 MWh, 16 GS, 10 MW / 40 MWh each at 33 kV):**
  - Sites, from the CEB tender notice: Kilinochchi, Vavuniya, Polonnaruwa, Valachchenai, Ampara, Vavunathivu, Monaragala, Mahiyanganaya, Chunnakam, Beliatta, Galle, Matara, Hambantota, Old Anuradhapura, Maho, Panadura.
  - Awards: 13 projects went to WindForce/Vidullanka (130 MW, rest "within 2–3 months" of Sep 2026) and 1 to Charisma Energy. The developer for each site has not been published.
- **Tendered, July 2026 (250 MW / 1,000 MWh, 25 GS, 33 kV, 15-yr BOO):**
  - Bids closed 14 Aug 2026; target commercial operation 6 May 2027.
  - Only 6 sites named: Ambalangoda, Chunnakam, Hambantota, Kurunegala, Matara, Pannipitiya.
- **Planned:** Maha Oya pumped storage, 600 MW, Aranayake/Nawalapitiya, under development with no date announced. 6 h storage is assumed.
- A "Batteries being built" toggle previews the grid with the 2025 programme running: charging at midday, discharging at the evening peak.

## Transformers layer
- 26 generator step-ups, a two-way transformer for every storage site, 14 transformers at 220/132 kV sites, 57 grid step-downs (132/33, 220/33, 132/11 kV), plus example 33/11 kV and 11 kV/400 V units. Shown from zoom 9.
- One symbol per voltage step per site. Unit counts and MVA ratings are not in the NTNSP map.
- 220/132 kV is inferred where both voltages meet (e.g. Rantambe, Lakvijaya). 16 substations with no voltage in the map are assumed 132/33 kV. Generator voltages are typical values.
- At midday about 10 dry-zone substations run in reverse.

## Correction to the earlier a.md
- a.md said "130 MW / 520 MWh connected 19 Sep 2026". Only the first 10 MW / 40 MWh (Anuradhapura) was connected; 130 MW is the WindForce/Vidullanka share of the programme.

## Model
- Flow arrows come from a DC load-flow over the map's lines for three typical hours: midday (2,600 MW demand, 1,500 MW rooftop), evening peak (2,650 MW), night (1,450 MW). The figures are indicative, not metered.
- Customer sites, primary substations and distribution transformers are illustrative examples.

## Self-updating website (GitHub Pages + Actions), prepared 27 Oct 2026
- Repository package: `sri-lanka-grid-map.zip`, made in the session (not yet pushed; no GitHub account linked).
- **Website:** `index.html` loads `data/pucsl.js`; data is no longer embedded. Hosted free at `<user>.github.io/sri-lanka-grid-map`; no domain needed.
- **Updater:** `scripts/fetch_pucsl.mjs` uses a headless Chromium (Playwright 1.47.2). On the PUCSL portal it selects 1D, sets the date range, presses Export CSV and captures the file in the page. It then merges the days into `data/pucsl.json` and `data/pucsl.js` and recalculates monthly totals. It re-fetches the last 3 days on every run.
- **Tests:** the in-page export was tested live in the user's Chrome on 20–26 Oct 2026 and 8–11 Feb 2025; the values matched the stored data. Parsing and merge logic are covered by `scripts/test_logic.mjs`.
- **Schedule:** `.github/workflows/daily-update.yml` runs daily at 07:07 UTC (12:37 Colombo), commits data changes, and opens a GitHub issue on a possible blackout.
- **Blackout detection rule:** total output below 82% of the 14-day median AND coal on the day or the next below 55% of its median.
  - On 2025–26 history it flags 9 Feb 2025 and 17 Oct 2026.
  - It also flags 12–13 Apr 2025 (New Year low demand), 15 Jun 2025 and 28–30 Nov 2025. These need human review.
- **PUCSL portal API:** same-origin `/api/...` routes. `/api/metadata/*` works from servers. `/api/actual-system-dispatch` takes `dateAggregation` (15min|day|month|year), `from` and `to`; the date format is unknown and test calls failed. The portal's own data requests were not visible in Chrome's network log.
