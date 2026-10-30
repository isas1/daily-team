# Extra editions and daily culture queue

Approved experiment: **30–31 October 2026**, Europe/Lisbon (UTC on these dates).
Normal Daily runs remain at 06:00. Three extra slots each day:

| Time | Lane | Input |
|---|---|---|
| 00:30 | news | Smashing + HN shortlist; selecting a feed candidate is mandatory |
| 02:30 | culture | Different past or present culture daily; continues after 31 October |
| 04:30 | popular | Top three rendered cards from the dated live Popular collection snapshot |

Six extra runs over the first two nights, then one culture run per day. Each produces six distinct reusable components and one
connected demo; optional cover, screenshots and source receipts. No additional
Sonnet/Haiku comparison calls in these extra runs. Current Claude provider and
subscription credentials are reused; no API-provider fallback.

GitHub schedule times are targets; jobs can start late and serialize behind
Daily. `editions.mjs` rejects news/popular dates outside the two-night window.
Culture dates map to a fixed, append-only sourced queue, one distinct culture ID per day.
Culture continues until that queue ends; exhausted dates skip without generation.
Manual dispatch uses the same guards for recovery. Existing completed records skip, failed records reuse
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

## Culture queue

Initial twelve sourced cultures, 30 October–10 November. This is a curated starting
queue, not an exhaustive list of world cultures. Append further sourced cultures
to `CULTURES` in `editions.mjs` without changing existing IDs or order. Date mapping
and saved input keep retries deterministic; never wrap back to the first culture.
Missed dates remain available through manual recovery and do not shift later assignments.

| Date | Culture and reference | Context |
|---|---|---|
| 30 Oct | [Japanese sashiko](https://www.vam.ac.uk/dundee/whatson/events/stitch-style-sashiko) | Living craft |
| 31 Oct | [Portuguese azulejo](https://estudoautonomo.dge.mec.pt/recurso/padroes-e-uma-visita-ao-museu-nacional-do-azulejo) | Living craft |
| 1 Nov | [Ancient Egyptian faience](https://australian.museum/learn/cultures/international-collection/ancient-egyptian/egyptian-faience/) | Historical |
| 2 Nov | [Yoruba adire](https://www.vam.ac.uk/articles/cloth-of-a-continent-africa-fashion) | Living craft |
| 3 Nov | [Ancient Greek Geometric pottery](https://www.namuseum.gr/en/collection/geometriki-periodos-3/) | Historical |
| 4 Nov | [Asante kente](https://www.vam.ac.uk/articles/cloth-of-a-continent-africa-fashion) | Living craft |
| 5 Nov | [Roman Imperial mosaics](https://www.metmuseum.org/art/collection/search/254536) | Historical |
| 6 Nov | [Korean jogakbo](https://www.vam.ac.uk/articles/jogakbo-traditional-korean-patchwork) | Living craft |
| 7 Nov | [Byzantine silk](https://www.metmuseum.org/art/collection/search/468141) | Historical |
| 8 Nov | [Chinese paper-cut](https://ich.unesco.org/en/RL/chinese-paper-cut-00219) | Living craft |
| 9 Nov | [Taquile Quechua textiles](https://ich.unesco.org/en/RL/el-arte-textil-de-taquile-00166) | Living craft |
| 10 Nov | [Indonesian batik](https://ich.unesco.org/en/RL/batik-indonesian-batik-00170) | Living craft |

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
