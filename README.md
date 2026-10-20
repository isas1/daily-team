# daily-team

A new four-person creative team every day, and the small web tool it built. This repository is the record: each day's team, its plan, and its asset, kept in [days/](days/) and listed in the [archive](ARCHIVE.md).

Everything in `days/` is written by a language model and checked by scripts, not by hand. The model and provider for each day are on its page.

## Today

<!-- TODAY:START -->
### 2026-10-20: Tuft

<a href="days/2026-10-20/"><img src="days/2026-10-20/team.png" alt="Team for 2026-10-20: Upholsterer · Clockmaker · Translator · Scheherazade" width="100%"></a>

**Task:** Checkbox: a mark that can be set, cleared, or left half done.

**Decision:** The page is one checkbox drawn as a padded linen square with a sewn button: the visitor presses it to pull the thread tight (set), presses again to leave the thread half drawn with a slack loop showing (half done), and presses again to l...

<a href="days/2026-10-20/"><img src="days/2026-10-20/artifact-1.png" alt="Screenshot of today's asset" width="100%"></a>

[Open the day](days/2026-10-20/) · [Use it](https://isas1.github.io/daily-team/2026-10-20/) · [Archive](ARCHIVE.md)
<!-- TODAY:END -->

## This week

<!-- WEEK:START -->
**Season 4**, since 2026-10-19. New this season: Wheelwright, Gilder, Thatcher, Lacemaker, Rope maker, Bell founder, Organ builder, Stage manager, Ariadne, Phileas Fogg, and 4 new temperaments. A new season with 8 new roles and 8 new methods is drafted every Monday.

### Vote on what gets built next

[Suggest a task](https://github.com/isas1/daily-team/issues/new?template=task-suggestion.yml) or vote with a thumbs-up on [open suggestions](https://github.com/isas1/daily-team/issues?q=is%3Aissue+is%3Aopen+label%3Atask-suggestion+sort%3Areactions-%2B1-desc). The most voted are screened every Monday.

No open suggestions yet.
<!-- WEEK:END -->

## Recent days

<!-- RECENT:START -->
| Date | Asset | Task | Team |
|---|---|---|---|
| [2026-10-20](days/2026-10-20/) | <a href="days/2026-10-20/"><img src="days/2026-10-20/artifact-1.png" alt="Tuft" width="160"></a> | Tuft | Upholsterer · Clockmaker · Translator · Scheherazade |
| [2026-10-19](days/2026-10-19/) | <a href="days/2026-10-19/"><img src="days/2026-10-19/artifact-1.png" alt="Clew Rim" width="160"></a> | Clew Rim | Taxidermist · Wheelwright · Glassblower · Daedalus |
| [2026-10-18](days/2026-10-18/) | <a href="days/2026-10-18/"><img src="days/2026-10-18/artifact-1.png" alt="Weft" width="160"></a> | Weft | Blacksmith · Urban planner · Weaver · Charles Darwin |
| [2026-10-17](days/2026-10-17/) | <a href="days/2026-10-17/"><img src="days/2026-10-17/artifact-1.png" alt="The Cold Room" width="160"></a> | The Cold Room | Florist · Teacher · Calligrapher · Daedalus |
| [2026-10-16](days/2026-10-16/) | <a href="days/2026-10-16/"><img src="days/2026-10-16/artifact-1.png" alt="Glass Cylinder" width="160"></a> | Glass Cylinder | Locksmith · Packaging designer · Window dresser · Scheherazade |
| [2026-10-15](days/2026-10-15/) | <a href="days/2026-10-15/"><img src="days/2026-10-15/artifact-1.png" alt="Spyhole" width="160"></a> | Spyhole | Ceramicist · Textile designer · Costume designer · Ada Lovelace |
| [2026-10-14](days/2026-10-14/) | <a href="days/2026-10-14/"><img src="days/2026-10-14/artifact-1.png" alt="Graveyard Shift" width="160"></a> | Graveyard Shift | Radio producer · Industrial designer · Museum curator · Odysseus |

[All 18 days](ARCHIVE.md)
<!-- RECENT:END -->

## How it works

1. **The team.** `team.sh` turns the date into four members, each with a role, a method, and a stance, plus a constraint and a spark: an open starting point, not a brief. From season 3 the team decides what to make from it. From season 3, each member also has a temperament: how they argue. The same date always gives the same team. Within a season no role or method repeats within 7 days, no constraint within 22 days, and no task within 61 days.
2. **The guest.** From season 2, member 4 is a guest who brings one method: a historical figure, a figure from myth, a character from an old book, an archetype, a person from the future, or a creature. Historical guests never speak as the person. Other guests speak in character, in original words, never quoting the source. Real people and authors must have died at least 100 years ago, myths are used in their traditional form, and gods of living religions, brands, and modern franchises are excluded.
3. **The cast.** Every Monday a language model drafts the next season: 8 new roles, 8 new methods, 4 new temperaments, and 2 new guests join, the longest-serving leave, and voted suggestions become sparks. Scripts check the draft and it opens as a pull request for review. Seasons start on a future Monday, so past days never change.
4. **The work.** Each morning a language model plays the team. Each member pitches a different thing to make from the spark, thinking from their own nature: their craft, or for a guest, their myth, era, or body. They argue for 6 to 10 lines, then the lead decides. If the team splits, a neutral referee picks one side. Then they build it as one HTML file: a toy, a picture, an instrument, a story, or a tool.
5. **The checks.** The file must have a title and a mobile layout, stay under 100 KB, and make no network requests. A file that fails is retried once, then marked "needs review".
6. **The record.** The workflow takes a screenshot, draws the team card, writes the day page, updates the archive and this README, and commits the result. Days that fail are recorded too.
7. **The weekly report.** Each Sunday a script gathers the week's changes, days, seasons, and GitHub activity, and a language model writes a short summary from those facts only. A check rejects any number or name that is not in the facts. Reports are in [reports/](reports/).

## Take part

[Suggest a task](https://github.com/isas1/daily-team/issues/new?template=task-suggestion.yml), vote with a thumbs-up on open suggestions, or read [CONTRIBUTING.md](CONTRIBUTING.md).

## Run your own

Fork the repo, then add one secret:

- `OPENROUTER_API_KEY` for OpenRouter's free models (the default). Create the key with a credit limit.
- Or `CLAUDE_CODE_OAUTH_TOKEN` from `claude setup-token` to use a Claude subscription, and set the repository variable `PROVIDER` to `claude`. Each day uses 2 to 5 requests from your plan's limits.

Optional variables: `MODEL`, `CLAUDE_MODEL` (default `claude-opus-5-5`), `ARTIFACTS` (0 to 4, default 1), `TZ`, and `PAGES` (`true` to publish the tools on GitHub Pages). To record a day by hand with your Claude login, run `sh daily.sh`. It commits and pushes.

The folder also works as a Claude Code skill: clone it into `~/.claude/skills/daily-team`, then use `/daily-team`.

## Safety

- Keys are passed only to the step that calls the model. They are never written to disk or printed.
- The Claude provider runs with no tools, no MCP servers, no user settings or hooks, and no CLAUDE.md, so the model can only return text.
- Every asset gets a Content-Security-Policy that blocks network requests. On GitHub Pages, assets run only inside a sandboxed frame.
- Free models can log prompts. Do not put private material in `brief.md`.
- See [SECURITY.md](SECURITY.md) to report a problem.

## License

Code and content: MIT.

Design: the Sam Creates design system, in [brand/](brand/). The fonts are Mozilla Headline and Mozilla Text under the SIL Open Font License 1.1; see [brand/fonts](brand/fonts).
