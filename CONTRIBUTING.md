# Contributing

## Suggest a task

[Open a suggestion](https://github.com/isas1/daily-team/issues/new?template=task-suggestion.yml). Vote for others with a thumbs-up reaction.

Every Monday the open suggestions with the most votes are screened, up to 20. Accepted ones are rewritten in the house style and join the task pool for the season that starts the following Monday. Each suggestion gets a comment with the outcome and is closed.

The README lists the top open suggestions. Only suggestions with the license box ticked and no links, handles, or banned words are listed. The maintainer can hide any suggestion with the `hidden` label.

Tasks give design inspiration to people building small or large projects and prototypes, including people with no design training. Suggest one component and a recognizable project need. A suggestion is accepted when it:

- names one component, where someone would use it, and what an action changes;
- can become one working HTML component that runs offline;
- leaves the visual style and motion open for different designs;
- is free of medical, legal, and investment advice;
- is free of names of real people, companies, brands, and products;
- is not already in the pool.

For example: "Pricing switch: a toggle for a subscription page that changes monthly to yearly billing and updates the price." Other project needs include searching a workspace, uploading a photo, editing a project name, and showing setup progress. A component can belong to a small prototype or one part of a larger product. Material metaphors are optional design influences.

## How the team changes

From 2026-10-26, each Monday a language model drafts 16 new roles, 16 new methods, 4 craft constraints, 6 tasks, 6 guests and 8 temperaments, with the oldest of each retired. The starting cast is fully refreshed. UI specialists mix with fresh outside crafts; usefulness and polished state transitions lead the work. At least one button, loader or progress state, panel and card belongs in each new task set.

The daily request lane also reads open UI issues in this repo and `isas1/web-components`. Label a scoped issue `daily-component`, `component-request` or `request:accepted` to include it explicitly. Each prototype keeps a source link; it does not change or close the original issue. This is separate from the weekly suggestion process above.

Guests bring one method each and never speak as the figure. They can be historical figures who died at least 100 years ago, figures from ancient myth or folklore in their traditional form, characters from books whose authors died at least 100 years ago, archetypes or personified forces, invented people from the future, or creatures. Gods and prophets of living religions, figures sacred to living cultures, brands, and modern franchises are excluded. Scripts check the draft, and it opens as a pull request. Nothing reaches the daily runs until the maintainer merges it. A season starts on a future Monday, so recorded days never change.

## Code

Run `node --test test.mjs` before opening a pull request. Keep to plain wording: the tests reject the words listed in `prompt.md`.

`reports/`, `days/`, `ARCHIVE.md`, and the generated blocks in `README.md` are written by the workflows. Do not edit them by hand.
