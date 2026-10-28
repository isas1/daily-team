# Daily Team packs, metadata and feed planning

Scope: implement the three calendar drafts in this repository. Preserve existing
dirty work, historical days, model transports and independent sibling projects.
No library migration, automatic acceptance, production import or deployment.

## Design and order

1. **Metadata contract and inventory audit.** Audit the local Forever Components
   catalog/taxonomy read-only. Record source hashes, role counts, theme mappings
   and ambiguous roles. Introduce a versioned Daily Team vocabulary: Actions,
   Inputs, Navigation, Content, Feedback, Data, Layout, Media. This is the approved
   producer vocabulary, not a replacement for the library taxonomy. Keep pack
   identity separate. Validate IDs, categories, source attribution, tokens,
   component purpose/input/outcome/recovery, references, states and file paths.
2. **Distinct packs.** Cut over on 2026-10-27; historical replays retain legacy
   prompts and behavior. Default to six components to limit cost while covering a
   useful project flow; allow explicit 1–10 counts, including smaller packs when
   justified. Zero remains planning-only. The team debates project direction and
   selects distinct reusable components in one planning call. Require a fenced
   JSON contract beside the session. Reject duplicate purposes/mechanisms, flag
   similarity across the last 28 days, and require a per-component reference.
   Build each component independently with common CSS tokens. Require every
   requested part to pass before connected demo assembly, including smaller packs. Persist manifest,
   tokens, selection and review state; never interpret script checks as approval.
3. **Feed opportunity input.** Add one bounded pre-planning stage (no extra model
   call). Fetch candidate RSS/Atom sources with byte/item/time bounds. Cache a
   small normalized backlog, stable IDs and attribution; exclude already-used
   concepts/articles and record recent purposes/interactions. Source failure
   falls back to backlog, then original task selection. Custom briefs win. Save
   immutable run input before any provider call and permit explicit snapshot
   replay. Build a shortlist from eligible requests, feed entries and inventory
   gaps; team supplies practical need, creative mechanism and similarity rationale
   in the same planning response. Fetched content remains data, never code or
   instructions. Track human library acceptance separately from generation.
4. **Integration.** Wire run CLI, comparison metadata, publishing/export checks,
   daily workflow cache and documentation. Invalid pack records block export;
   historical records load unchanged. Generated candidates stay needs-review.
5. **Verification.** Native suite covers malformed contracts/feeds, duplicate
   purposes, unknown categories, path traversal, fallback, bounds, replay and
   historical compatibility. Mock provider runs exercise actual CLI through pack
   assembly and export. A deterministic sample pack demonstrates shared state,
   independent components, themes, keyboard input and mobile fit. Browser review
   records actual checks without claiming generated samples prove future quality.

## Endpoint verification, 2026-10-27

- Smashing Magazine https://www.smashingmagazine.com/feed/: HTTP 200,
  application/xml, valid RSS, 40 items, 1,337,780 bytes. Use a 2 MiB limit.
- Codrops https://tympanus.net/codrops/feed/ and /feed/rss/: HTTP 410.
  https://codrops.com/feed/: HTTP 404. Keep Codrops disabled with explicit reason;
  do not silently depend on a guessed URL. Backlog and other sources keep runs usable.

- Hacker News https://news.ycombinator.com/rss: HTTP 200, valid RSS, 30 items. Added
  after user request; broader news receives UI/tool relevance filtering.

## Completion evidence

All five implementation stages complete locally. Runner, structured prompts,
metadata/export gates, comparisons, workflow/local cache wiring, inventory audit,
human outcome ledger and guide implemented. No library migration/import, remote
push, deployment or live model call.

- Full regression suite: **94 passed, 0 failed**. Final affected checks after
  validation/replay/comparison changes: **14 passed, 0 failed**.
- JS/shell syntax, workflow YAML parsing, whitespace diff checks passed.
- Real runner mock-provider sample: six distinct standalone jobs plus connected
  demo; manifest/input/token/HTML hashes validate. Eight mock provider replies.
- Native browser: shared name/package/audience/budget state, error and recovery,
  keyboard Space/Enter, dark/light appearance, phone demo and all six standalone
  tiles at 390px without horizontal overflow. Viewport restored afterward.
- Live discovery through production code: Smashing fetched nine recent items;
  HN fetched twenty; cache, bounded balanced list and relevant shortlist saved.
- Inventory snapshot records actual library totals, hashes, role-to-category
  proposals, ambiguous art roles and provisional gaps. Library files unchanged.
- Library outcome report: six generated, six unreviewed, zero accepted. Explicit
  hash-bound evidence ledger supports later human acceptance/rejection tracking.

Guide: `docs/component-packs.md`. Sample/evidence: `work/pack-sample/`.
Browser screenshots and hash-bound QA: `work/pack-sample/browser-qa.json`.
Sample uses handwritten deterministic responses, not a live model. Semantic
usefulness/distinction, future generated behavior and actual library acceptance
still require human review; heuristic source checks do not establish these.
Codrops remains disabled until a working endpoint can be verified.
