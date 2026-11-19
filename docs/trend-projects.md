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

## Problem-first daily runs

From 2026-11-19, new project runs use the problem-first contract. GitHub Trending,
Hacker News RSS and Smashing Magazine RSS supply leads in parallel. The planner
must point to an exact phrase supporting the problem. Curated Reddit briefs are
available on every run and serve as fallbacks when the live leads are weak.
The runner does not fetch Reddit for new runs.

To add a brief, read the thread and its proposed answers. Add a short description,
current workaround and remaining gap in `problem-briefs.json`. Use the canonical
Reddit post link and the date reviewed. Keep post text and usernames out. Entries
expire after 90 days and rest for 28 days after use. An explicit `--brief` bypasses
discovery. If nothing supports a useful offline solution, the run records a failed
day. A maintainer can retry with a reviewed brief and `--force`, or with the
Daily workflow's `brief` and `force` inputs.

The plan sets four browser checkpoints before the build: a primary input,
a second input, an error and recovery. The build sees the primary checkpoint and
the public control IDs. Chromium runs all four at phone width, in the same
sandbox as the published page. A failed check gets one build retry. The runner
saves only passing HTML, with a receipt tied to the file and the test cases.
The day page shows the problem, its source and the browser result.

For a local build, install the browser checks once:

```sh
npm install --no-save --no-package-lock --ignore-scripts playwright@1.63.0
./node_modules/.bin/playwright install chromium --only-shell
```

Set `CHROME` to use a different Chrome executable. Plan-only runs need no browser.

## Historical discovery

- GitHub Trending, weekly view: public repository cards and descriptions.
  The timestamp means observed today, not repository publication date.
- Hacker News RSS: broad technical and social signals.
- Reddit r/SideProject and r/InternetIsBeautiful Atom feeds: project needs and
  interaction ideas. Rate limits are expected; failures remain in receipts.
- Smashing Magazine RSS: design context. GitHub Blog RSS stays disabled because
  its current feed contains declarations rejected by the restricted XML reader.

Each date selects one enabled source in a fixed rotation. Only that source is
fetched, and candidates come only from that source, including cached fallback.
The team selects exactly one item and explains how it inspires the interactive
project. Items must be at most 14 days old and unused in the last 28 days. If
no eligible item remains, the run stops with a clear error; it does not silently
use another feed or invent an inspiration. Custom briefs bypass discovery.

Requests have an eight-second timeout and 2 MiB ceiling. Feed parsing rejects
unsafe declarations; discovery never executes source code. GitHub Trending HTML
can change; an unrecognized page fails visibly. No extra model call is needed.

## Originality and scope

The team compares three directions with different first actions and visible
results. The chosen direction names a rule from one member's craft and uses it
in a calculation, constraint or state change. The plan records a visual direction
and a trial with starting data, an exact input, the expected result, a likely
mistake and recovery. The builder uses these details to implement the workflow.
Recent visual directions go to the planner so it can spot repeated layouts.

New planning snapshots require this craft contract. The planner gets one retry
for missing fields, repeated action or result text, or a project name that
matches none of the pitches. Existing snapshots and records keep their earlier
contract. Recent name and problem/mechanism overlap checks screen for close
lexical repeats. Browser and human review judge semantic novelty, usefulness and
visual quality.

One self-contained `artifact-1.html` supplies the entire useful workflow, with
sample data, input, result and recovery. No network requests, dependencies or
pretend live service integrations. Projects can scroll and use multiple controls;
component tile sizing does not apply. Apply [minimum-copy rules](component-copy.md)
across the whole initial project: aim for at most 40 rendered words, including
labels and sample data. Allow more only when essential for clarity or the task.
Use a plain title and, if needed, one short action-and-result sentence. Keep optional help and credits collapsed. Normal runs no longer pay
for component model comparisons. Their cover and archive stages continue.

The build request carries the chosen direction, build notes and selected
attribution. A missing inline script or classic JavaScript syntax error triggers
one build retry. If the problem persists, the runner records a failed artifact
without saving the HTML. This source check compiles classic scripts without
running them. Browser review still covers behavior and module scripts. The full
planning record stays available for review. Pages show seven recent projects and
link to the full archive as it grows.

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
