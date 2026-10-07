---
name: daily-team
description: Shows today's creative team and task, drawn from the date so they change every day. Has the team argue and decide on a plan for a brief, or builds the plan as single-file HTML artifacts. Use when the user asks for today's team or task, a creative team, a brainstorm with distinct roles, or new angles on a brief.
argument-hint: "[publish | recruit | build [1-4]] [brief]"
allowed-tools: Bash(sh *team.sh*)
---

# Daily team

!`sh "${CLAUDE_SKILL_DIR}/team.sh"`

Request: $ARGUMENTS

If the team above is missing or shows an error, run `sh team.sh` from this skill's folder and use its output.

## Modes

Pick exactly one mode from the request. Do no more than that mode asks.

| Request | Do |
|---|---|
| Empty | Print the team and task above as written. Stop. Do not read prompt.md. |
| A brief | Write the session for the brief. Stop. Do not build. |
| `build`, optional count 1 to 4, optional brief | Write the session for the brief, or for today's task if there is none. Then build that many artifacts (default 1). |
| `publish` | Ask the user and wait for a yes. Run exactly `sh daily.sh` from this skill's folder, with no flags. It records today's team and artifact with the user's Claude subscription, then commits and pushes. Report its output. |
| `recruit` | Ask the user and wait for a yes. Run exactly `sh recruit.sh` from this skill's folder, with no flags. It drafts next week's season, runs the tests, pushes a branch, and opens a pull request. Give the user the link. |

## Session

Read [prompt.md](prompt.md) in this skill's folder, sections "Work the brief" and "Writing rules", and follow them. Output the session itself, with no lead-in. Write each section heading as a level-two heading: `## Pitch`, `## Clash`, `## Decision` or `## Deadlock`, `## Build notes`.

If the session ends in a Deadlock, apply the "Referee" section of prompt.md once and output its ruling. Never run a second referee.

## Build

Also read the "Build an artifact" section of prompt.md. Copy this checklist and tick it off:

```
Build progress:
- [ ] Session written and reviewed
- [ ] Artifact 1 written, member 1 leading, and reviewed
- [ ] Artifact n written, member n leading, and reviewed (one line per artifact)
```

Write artifact n to `team-builds/<date>/artifact-<n>.html`, relative to the working directory the user started in, not this skill's folder or a scratchpad. Write one complete file per artifact, not parts joined later. Member n leads artifact n, so each artifact takes its look and layout from a different member. Give the user the paths at the end.

## Review

Check the session and each artifact against this list. If any item fails, fix it and check again. Give the paths only when every item passes.

- The session has `## Pitch`, `## Clash`, and then `## Decision` or `## Deadlock`. The Clash has 6 to 10 lines, and no member speaks more than 3 times.
- No word from the banned list in "Writing rules", no exclamation marks, and no emoji.
- The artifact has a title element and a viewport meta tag, and is under 100 KB.
- No external scripts, styles, fonts, images, or iframes, no `@import`, no `fetch` or other network calls, and no form that posts to another site.
- The decision's concept is visible on the first screen, and a credits line at the bottom names each member.
- It loads with a worked example already entered.
- Inputs update the result at once, with no submit button for calculations, and labels are 1 to 3 words with no paragraphs of instructions.

## Requirements

- Team, session, and build: `sh` and `awk`.
- `publish` and `recruit`: Claude Code, git, `gh` signed in, and Node 20 or later. Chrome is optional, for images.
