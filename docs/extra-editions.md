# Two-night extra editions

Approved experiment: **30–31 October 2026**, Europe/Lisbon (UTC on these dates).
Normal Daily runs remain at 06:00. Three extra slots each day:

| Time | Lane | Input |
|---|---|---|
| 00:30 | news | Smashing + HN shortlist; selecting a feed candidate is mandatory |
| 02:30 | culture | 30th: Japanese sashiko repair craft; 31st: Portuguese azulejo pattern craft |
| 04:30 | popular | Top three rendered cards from the dated live Popular collection snapshot |

Six extra runs total. Each produces six distinct reusable components and one
connected demo; optional cover, screenshots and source receipts. No additional
Sonnet/Haiku comparison calls in these extra runs. Current Claude provider and
subscription credentials are reused; no API-provider fallback.

GitHub schedule times are targets; jobs can start late and serialize behind
Daily. `editions.mjs` rejects dates outside the two-night window; future cron
wakeups do not generate anything. Manual dispatch permits only those same dates
and lanes for recovery. Existing completed records skip, failed records reuse
saved planning input. No `--force`, no overwrite of normal day records.

Records: `editions/<lane>/days/YYYY-MM-DD/`. Published at
`https://isas1.github.io/daily-team/editions/<lane>/YYYY-MM-DD/`.
Main daily publication rebuilds all recorded edition pages too. Incomplete pack
exports are withheld with a log warning; receipts remain in GitHub. The site index
shows published versus recorded counts. Generated output always needs human review.

Popular seeds: [snapshot](popular-snapshot-2026-10-30.json), observed live from
[Popular](https://forevercomponents.com/?collection=popular). It records display
scores, not unique voters or raw vote totals. Both nights use this dated snapshot;
no claim of a fresh ranking at each run. Expand useful behavior with companion
jobs rather than cloning artwork or making palette-only variants.

Culture references: [V&A Dundee sashiko workshop](https://www.vam.ac.uk/dundee/whatson/events/stitch-style-sashiko),
[Portuguese education resource with National Azulejo Museum material](https://estudoautonomo.dge.mec.pt/recurso/padroes-e-uma-visita-ao-museu-nacional-do-azulejo).
Use craft principles, original work and clear attribution; no sacred imagery or
claims of cultural authenticity.

## Tell whether feeds worked

Open a day's **Feed evidence** section (GitHub README or published page):

- `fetched (N items)`: fetch and parse succeeded.
- `cached` / `offline`: existing backlog used; no fresh fetch claimed.
- `failed` plus reason: source failed; normal days can fall back.
- `Used feed inspiration`: an article ID was selected or cited in component sources.
- `Chosen opportunity`: team's actual choice and rationale. Fetch success alone
  does not mean the team used a feed article.

`planning-input.json` preserves sources, candidates and status. `day.json` stores
`planning.selection` and `selectedSourceIds`. News editions reject non-feed choices;
without eligible news candidates they fail visibly instead of relabeling a normal task.
