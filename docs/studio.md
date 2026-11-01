# The studio

A studio day replaces the single session call with a small simulation. Four member agents, one
per team member, spend a working day in a studio. The run records every event in
`days/<date>/sim.jsonl`. A replay page, `watch.html`, plays the day on the site.

## How a day runs

| Part | File | What it does |
|---|---|---|
| World and director | `sim/world.mjs` | Stations, phases, energy, trust, the board, the keyboard, seeded events, beats. No model calls. |
| Members | `sim/agent.mjs` | One call per member per round. Each member sees only its own station and its own notes. |
| Round loop | `sim/run-sim.mjs` | Four calls in parallel per round, applied in member order, written to the log as they happen. Interviews, draft review and season memory. |
| Session | `sim/adapter.mjs` | Pitch and Clash come from the log. One scribe call writes the Decision, Build notes and any JSON the day's mode needs. |
| Look | `sim/look.mjs`, `sim/rig.mjs` | One call after the cover designs the cast and the set. The rig checks it and draws it. |
| Replay | `sim-view.mjs`, `sim/viewer.js` | Builds `watch.html` and the turning points on the day page. |
| Live | `sim/live.mjs` | Local server that streams the log to the viewer while the day runs. |

Stations: whiteboard (pitches, votes; speech reaches everyone), workbench (one keyboard),
wall (task and references), kitchen (rest; private talk), door (news).

Phases for 16 rounds: arrive 1 to 2, pitch 3 to 5, clash 6 to 10, decide 11 to 12, build 13 to
15, wrap 16. Other lengths scale.

What keeps it honest: each member has a private stance and a rival it watches, the board has six
slots, energy drops every four rounds, one Clash event and one Build event arrive from a pool
seeded by the date (`sim/events.txt`), and if nobody blocks by the middle of the Clash the
director tells one member that the leading idea breaks what it pushes for. A tied vote goes to
the lead.

## Turning it on

| Setting | Default | Meaning |
|---|---|---|
| `SIM` | off | `1` runs the studio for this run. The Daily workflow has a `sim` input. |
| `SIM_DAYS` | empty | Dates, comma-separated, that always run the studio. Also `SIM_DAYS` in `sim/run-sim.mjs`. |
| `SIM_MODEL` | `claude-haiku-5-5` | Model for member turns and interviews. |
| `SIM_ROUNDS` | 16 | Rounds in the day. |
| `SIM_CONCURRENCY` | 4 | Member calls at once. |
| `SIM_MAX_USD` | none locally, 3 in CI | Cost cap. Over the cap the day falls back to the single session call. |
| `SIM_INTERVIEWS` | on | `0` skips the after-day interviews. |
| `SIM_REVIEW` | off | `1` adds a draft, a review by the other three members, and a final build. One extra build call. |
| `LOOK_MODEL` | `claude-sonnet-5-5` | Model for the look call. |

A brief (`--brief` or `brief.md`) never runs the studio.

If the sim fails or hits the cap, `day.json` records `sim.status: fallback` with the error, the
log is removed, and the single session call runs as before.

## Try it

Run the studio alone, with no scribe or build, into a temp folder:

```bash
node sim/cli.mjs --date 2026-10-31 --rounds 12 --max-usd 2
```

Watch a day while it runs, on your own machine:

```bash
node sim/live.mjs --run --rounds 12 --dir /tmp/studio
```

Then open `http://127.0.0.1:4417/`. The server binds to 127.0.0.1 only.

## The replay page

`publish.mjs --site` writes `_site/<date>/watch.html` for every day with a `sim` record. It has
play, pause, speed, back and next, a timeline with marks at turning points, a Highlights switch
(turning points only), a Thoughts switch, member cards with energy, trust and interviews, and an
end card that opens the day's asset in a sandboxed frame. Add `?premiere=<ISO time>` to start the
replay at a set time.

The GitHub day page cannot run scripts, so it shows a Watch link, up to eight turning points, one
line per member and the interviews as plain text.

## Safety

- Model text reaches the page only through `textContent`. The log is inlined as JSON with `<`, `>`
  and `&` escaped, so nothing can close the data block.
- The look is data, not markup: hex colours, names from fixed lists, and SVG path data that must
  contain only path commands and numbers inside its box.
- The replay page uses the site CSP: no network, no external files. Live mode adds
  `connect-src 'self'` on localhost only.
- Historical guests are played as practitioners of the figure's method. A check rejects
  first-person claims of the figure's life.
- Member turns follow the writing rules: banned words, emoji and exclamation marks are rejected
  with one retry; a second failure keeps the member quiet that round.
- `sim/look.mjs` never changes `day.json`, because the cover's hash depends on it.

## Season memory

After each studio day every member's last note is stored in
`days/_studio/memory-<season>.json`, five per role. A role that returns later in the same season
reads its own notes.
