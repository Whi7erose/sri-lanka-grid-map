# Sri Lanka Grid Flow Map

An interactive map of the Sri Lanka power grid: transmission lines and substations from the NTNSP map, power stations, battery storage, transformers, modelled power flows, generation by source (daily, monthly, yearly), electricity sales, and the history of island-wide blackouts.

The generation data updates itself every day from the PUCSL Electricity Dispatch Data portal (https://gendata.pucsl.gov.lk), using GitHub Actions. The site is hosted free on GitHub Pages.

## What is in this repository

| Path | What it is |
|---|---|
| `index.html` | The website: map, Data view and News view |
| `data/pucsl.json` | Generation by source: monthly since 2016, daily since Jan 2025, plus four blackout months |
| `data/pucsl.js` | The same data, in the form the website loads |
| `data/alerts.json` | Days the updater flagged as possible blackouts (created on first alert) |
| `scripts/fetch_pucsl.mjs` | The daily updater |
| `scripts/test_logic.mjs` | Tests for the updater's parsing and merging |
| `.github/workflows/daily-update.yml` | Runs the updater every day at 12:37 Colombo time |

## How the daily update works

1. GitHub Actions starts a small Linux machine once a day.
2. `fetch_pucsl.mjs` opens the PUCSL portal in a headless Chrome. It selects the daily view and the days that are missing, re-checking the last 3 days because PUCSL sometimes revises them. Then it presses **Export CSV**, the same file anyone can download from the portal.
3. The figures are merged into `data/pucsl.json` and `data/pucsl.js`, and the monthly totals are recalculated.
4. If anything changed, the workflow commits the files, and GitHub Pages republishes the site within a minute or two.
5. If total generation drops well below normal and coal output collapses (the pattern of every island-wide blackout since 2020), the workflow opens a GitHub issue so someone can check the news and add the story.

You get an email from GitHub if a run fails, for example if PUCSL redesigns its portal.

## One-time setup

1. **Create a free GitHub account** at https://github.com if you don't have one.
2. **Create a new public repository**, for example `sri-lanka-grid-map`. Leave "Add a README" unticked.
3. **Upload these files.** Either let Claude push them for you, or on the repository page choose **Add file → Upload files** and drag in the contents of this folder, including the `.github` folder.
4. **Turn on the website:** **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `main`, folder `/ (root)` → Save.** After a minute the site is live at `https://<your-username>.github.io/sri-lanka-grid-map/`.
5. **Allow the updater to save data:** **Settings → Actions → General → Workflow permissions → Read and write permissions → Save.**
6. **Test it:** open the **Actions** tab, choose **Daily PUCSL data update → Run workflow**. After a few minutes a commit called "Data: PUCSL update …" appears if there were new days.

## Costs

* GitHub Pages and GitHub Actions are free for public repositories. Check https://github.com/pricing for current terms.
* No domain is needed: the `github.io` address works with HTTPS.
* A custom domain is optional, for example `lankagrid.org`, for roughly US$10–20 a year from any registrar (`.lk` names from LK Domain Registry cost more). Add it under **Settings → Pages → Custom domain** and point a CNAME record at `<your-username>.github.io`.

## Re-fetching a range

**Actions → Daily PUCSL data update → Run workflow**, then fill in `from` and `to` (YYYY-MM-DD). Locally:

```bash
npm install && npx playwright install chromium
FROM=2026-10-01 TO=2026-10-26 node scripts/fetch_pucsl.mjs
```

## Things to know

* **PUCSL's portal is not an official API.** If its layout changes the updater stops and GitHub emails you. Asking PUCSL for permission or an official data feed would make this sturdier.
* **Scheduled workflows in public repositories pause after 60 days without commits.** The daily data commits keep it active. If it ever pauses, re-enable it in the **Actions** tab.
* **Rooftop solar figures are PUCSL estimates,** and their method changed in late 2025.
* **Only generation data updates automatically.** Line positions, power stations, storage sites and blackout stories are maintained by hand in `index.html`. Some network positions are approximate and are marked on the map.

## Data sources

PUCSL Electricity Dispatch Data portal; NTNSP network transmission map; CEB Statistical Digests 2017–2025; Ember via Our World in Data; news reports and PUCSL reports for blackouts. Full links are in the map's **Sources** tab and under each blackout story.
