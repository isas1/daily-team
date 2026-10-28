# Component packs

New component runs from **2026-10-27** generate distinct reusable components in
one project context. Earlier dates retain their recorded variation format and
legacy replay prompts. No past days or library records migrate.

Default size: **six**, a starting balance between distinct jobs and generation
cost. `--artifacts 1` through `--artifacts 10` override it; every plan must justify
its size. `--artifacts 0` plans six components and writes metadata without building.
Every nonzero pack gets a connected `piece.html`, including smaller packs.
All requested components must pass source checks before demo assembly.

## Run

```sh
# Inspect prompts without networking, cache writes or provider calls.
node run.mjs --date 2026-10-27 --dry-run

# Generate into a review folder with your existing Claude subscription login.
node run.mjs --provider claude --date 2026-10-27 --out work/review-days

# Explicit custom component pack; ordinary --brief retains legacy page mode.
node run.mjs --provider claude --pack --brief "Prepare a product launch" --artifacts 4 --out work/review-days

# Replay saved discovery input; date must match snapshot.
node run.mjs --provider claude --date 2026-10-27 --snapshot work/review-days/2026-10-27/planning-input.json --out work/replay-days

# Read-only library audit and optional inventory context.
node inventory-audit.mjs ../web-components work/current-inventory.json
node run.mjs --provider claude --inventory work/current-inventory.json --out work/review-days
```

`--offline` or `COMPONENT_FEEDS=0` uses backlog without fetching or changing it.
`--feed-cache path.json` / `COMPONENT_FEED_CACHE` chooses backlog location;
default `.cache/feed-backlog.json`. Daily workflow/local script commit this
normalized cache with day records, so subsequent runners retain it.
`COMPONENT_INVENTORY_FILE` sets optional inventory report. No sibling path or
private library access is required on hosted runners.

Failed runs reuse their saved input automatically. `--force` deliberately
replaces a day and takes fresh inputs unless `--snapshot` names the input to reuse.
Model outputs remain nondeterministic; input replay does not promise identical
HTML. A generation interrupted after planning is marked `building`; publishing
blocks incomplete packs. Use `--force --snapshot ...` to rebuild explicitly.

## Planning and feed behavior

One pre-planning discovery stage, **zero additional model calls**. Smashing
Magazine RSS and Hacker News official RSS are enabled. Verified 2026-10-27:
Smashing returned HTTP 200/40 items; HN returned HTTP 200/30 items. Codrops
candidate feed returned HTTP 410 and stays disabled until a replacement is
verified. Source failures remain visible in the snapshot.

Per source: eight-second timeout, 2 MiB byte ceiling, no redirects, at most
20 recent entries, 60-day age bound. Restricted RSS/Atom parsing rejects DTDs,
entities and malformed nesting; external code never runs. Titles and brief
plain-text excerpts retain source/date attribution. No linked article or demo
code is fetched. HTTPS links normalize tracking parameters for stable IDs.
Cache retains at most 100 entries; candidates balance sources, exclude articles
used in the previous 28 days, and filter for UI/tool/design relevance. Broad HN
news may produce no suitable candidates; this is a normal fallback.

Eligible issue requests, up to five feed candidates, optional provisional
inventory gaps and the original task enter the saved input. Custom pack briefs
bypass feeds. Issue bodies stay temporary; snapshots retain scoped task/title
and source identity. Team pitches/debates project directions, writes a shortlist
with need/use/interaction/similarity, and chooses one with rationale in its
normal planning call. Feeds inspire useful original work; popularity alone is
not a quality signal. Weak/failed feeds fall back to backlog, then task selection.

## Contract and files

`component-pack.mjs:packProblems` is the executable contract validator. Plan must
contain exactly one fenced JSON object, plus Pitch/Clash/Decision/Build notes.

| Scope | Required values |
|---|---|
| Version | `schemaVersion:1`, `categoryVersion:1` |
| Pack | slug `id`, `name`, `description`, `project`, `sizeRationale` |
| Selection | `opportunities` (1–5 objects: id, need, use, interaction, similarity), `selection` (id, rationale) |
| Component | sequential `row`, slug `id`, name, description, category, tags, purpose, use, input, outcome, recovery, mechanism, nearestAnalogue, usefulness, creativeDifference, states, sources, file |
| Attribution | each component has 1–5 `{title,url}` HTTPS references |
| Tokens | dark/light bg, surface, text, muted, accent, border; typography family/size; spacing gap/padding; control radius; motion duration/easing |
| Demo | `file:"piece.html"`, every row, explicit `sharedState` |

One primary category per component: **Actions, Inputs, Navigation, Content,
Feedback, Data, Layout, Media**. Tags express specific uses; project names never
create categories. Version changes require a deliberate validator/docs change.
Local library audit found theme-based metadata and role hints, not this exact
vocabulary. [Audit proposal](../work/pack-inventory-audit.json) records source
hashes, counts, mapping and ambiguous art-only roles. All mappings require review;
low mapped counts are provisional opportunity hints, not proven gaps.

Exact/near lexical purpose and mechanism duplicates block planning. Similarity
to recent packs produces visible review warnings. These are heuristics: semantic
overlap, usefulness and creative distinction still need human assessment.

Each day writes:

- `planning-input.json`: normalized discovery, task/request, recent context.
- `day.json`: session, selection, generation state, input hash and HTML hashes.
- `pack.json`: export manifest; date-prefixed stable pack/component IDs, file
  references, shared tokens, generation state and human review status.
- `tokens.json`: exact pack tokens, injected into every standalone file/demo.
- `artifact-N.html`: independent components; `piece.html`: connected project.

CSS uses `--pack-*` variables; model output cannot redeclare these tokens.
Token values/keys are validated before CSS injection. Source checks preserve
offline operation, theme messages, reduced motion, visibility handling and tile
semantics. Publishing preflights version/category/file metadata, input/token/
manifest consistency and HTML hashes before writing docs or exporting a pack.
Site export includes standalone HTML and JSON beside the sandboxed day page.
Unknown categories, tampered bytes or incomplete generation block export.

## Human outcomes

Generation never approves or imports a component. Manifests start
`reviewStatus:needs-review`, `libraryAcceptance:unreviewed`. Source status `ok`
only means scripts passed. Verify behavior, accessibility, themes, mobile fit,
purpose and creative distinction before reuse.

After an actual library decision, record evidence explicitly:

```sh
node pack-review.mjs work/review-days/2026-10-27 release-name accepted https://example.com/library/release-name "Human review and library inclusion verified"
node pack-review.mjs --report work/review-days
```

Use `rejected` for a rejection with review evidence. `library-review.json` is a
separate local append-only event ledger, bound to exact component IDs/HTML hashes;
it does not change generated manifests or publish anything. Latest outcome counts
as accepted/rejected only while bytes still match. Edited/replaced files count as
stale; generated/unreviewed counts remain separate. Evidence claims are human
records, not automated verification of a destination library.

## Verification sample

```sh
node --test test.mjs comparison.test.mjs pack.test.mjs
node pack-sample.mjs
```

[Sample demo](../work/pack-sample/days/2026-10-27/piece.html),
[manifest](../work/pack-sample/days/2026-10-27/pack.json),
[evidence](../work/pack-sample/evidence.json).
Handwritten deterministic provider fixture exercises actual runner and export;
eight mock replies, six distinct jobs, one connected project, zero live model
calls. Browser evidence covers shared state, error/recovery, keyboard input,
dark/light appearance and 390px standalone fit. Fixtures verify plumbing and
contracts; they do not establish future model output quality or human acceptance.
