# Trend-inspired projects

From 2026-10-31 normal Daily Team runs build **one complete interactive project**.
Four roles still pitch, clash and decide. The saved project contract requires
audience, problem, action, useful result, recovery, mechanism, difference from a
usual approach, why now, evidence IDs and three compared directions. This changes
the normal runner, not just its README. Old days and extra editions remain intact.

The private component continuation is [isas1/daily-components](https://github.com/isas1/daily-components),
an independent private copy with full Daily Team history through `b3d085c`.
GitHub does not support a private fork of a public repository, so this is a
history-preserving copy rather than a GitHub fork-network member. Existing
`isas1/component-team` is untouched. Add the new repo's model secret to activate
generation; encrypted GitHub secrets cannot be read back or copied. Its provider
is Claude and Pages is off. Component source access remains optional.

## Discovery

- GitHub Trending, weekly view: public repository cards and descriptions.
  The timestamp means observed today, not repository publication date.
- Hacker News RSS: broad technical and social signals.
- Reddit r/SideProject and r/InternetIsBeautiful Atom feeds: project needs and
  interaction ideas. Rate limits are expected; failures remain in receipts.
- Smashing Magazine RSS: design context. GitHub Blog RSS stays disabled because
  its current feed contains declarations rejected by the restricted XML reader.

Every source has an eight-second timeout, 2 MiB ceiling and at most 20 entries.
RSS parsing rejects unsafe declarations; discovery never executes source code.
Project candidates use a 14-day freshness window and balance source families.
The shared 100-item normalized cache supplies fallback. IDs used in the previous
28 days are excluded. No extra model request is needed for discovery.

Use at least two source families when available. If only one survives, use it;
if none survives, record `original-fallback`, with no invented trend claims.
Custom briefs bypass discovery and take priority. GitHub Trending HTML can change;
an unrecognized page fails visibly rather than inventing repository entries.

## Originality and scope

The team compares three concrete directions, combines a need with a mechanism
from another field, and names the useful difference. Recent project name and
problem/mechanism overlap checks block close lexical repeats. These heuristics
do not prove semantic novelty, usefulness or visual quality. Source checks flag
issues; browser and human review still judge generated work.

One self-contained `artifact-1.html` supplies the entire useful workflow, with
sample data, input, result and recovery. No network requests, dependencies or
pretend live service integrations. Projects can scroll and use multiple controls;
the component tile size and word limits do not apply. Normal runs no longer pay
for component model comparisons. Their cover and archive stages continue.

## Run and replay

```sh
node run.mjs --date 2026-10-31 --dry-run
node run.mjs --provider claude --project --out work/project-review
node run.mjs --project --brief "An explorable sound-mixing lesson" --artifacts 0
node run.mjs --project --date 2026-10-31 --snapshot saved/planning-input.json --out work/replay
node run.mjs --pack --artifacts 6 --out work/components
node --test test.mjs security.test.mjs comparison.test.mjs pack.test.mjs editions.test.mjs project.test.mjs
```

`--offline` / `COMPONENT_FEEDS=0` reads backlog without fetching or changing it.
Dry runs do not call models, fetch sources or write cache. Failed days reuse saved
inputs; `--force` takes fresh inputs unless `--snapshot` selects a saved one.
Mode mismatch fails explicitly. Custom project briefs require `--project` when
using a historical date; `--pack --brief` always retains component mode.

`planning-input.json` records candidates, source statuses, recent work and task.
`day.json` records project contract, selected IDs, input hash and HTML hash.
Publishing verifies these receipts and exports the saved input and project HTML.
The normal 06:00 UTC schedule uses project mode; workflow dispatch offers project
or components. Existing culture editions continue as previously scheduled.
