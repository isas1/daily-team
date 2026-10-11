# Contributing

## Suggest a task

[Open a suggestion](https://github.com/isas1/daily-team/issues/new?template=task-suggestion.yml). Vote for others with a thumbs-up reaction.

Every Monday the open suggestions with the most votes are screened, up to 20. Accepted ones are rewritten in the house style and join the task pool for the season that starts the following Monday. Each suggestion gets a comment with the outcome and is closed.

The README lists the top open suggestions. Only suggestions with the license box ticked and no links, handles, or banned words are listed. The maintainer can hide any suggestion with the `hidden` label.

From season 3, tasks are sparks: open starting points the team makes something from. A suggested tool is rewritten as a spark that keeps its idea. A suggestion is accepted when it:

- gives the team an image, a force, a place, or a moment to work from;
- can become one HTML page that works offline;
- is free of medical, legal, and investment advice;
- is free of names of real people, companies, brands, and products;
- is not already in the pool.

## How the team changes

Each Monday a language model drafts the next season: 8 new roles, 8 new methods, 2 constraints, 6 tasks, and 2 guests, with the oldest of each retired.

Guests bring one method each and never speak as the figure. They can be historical figures who died at least 100 years ago, figures from ancient myth or folklore in their traditional form, characters from books whose authors died at least 100 years ago, archetypes or personified forces, invented people from the future, or creatures. Gods and prophets of living religions, figures sacred to living cultures, brands, and modern franchises are excluded. Scripts check the draft, and it opens as a pull request. Nothing reaches the daily runs until the maintainer merges it. A season starts on a future Monday, so recorded days never change.

## Code

Run `node --test test.mjs` before opening a pull request. Keep to plain wording: the tests reject the words listed in `prompt.md`.

`reports/`, `days/`, `ARCHIVE.md`, and the generated blocks in `README.md` are written by the workflows. Do not edit them by hand.
