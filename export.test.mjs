// Validate committed exports as well as synthetic generation fixtures.
import { test } from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDays } from './publish.mjs';
import { assertPackExport } from './component-pack.mjs';
import { assertProjectExport } from './project-planning.mjs';

const root = dirname(fileURLToPath(import.meta.url));
for (const base of ['days', 'editions/news/days', 'editions/culture/days', 'editions/popular/days']) {
  for (const day of loadDays(join(root, base))) {
    test(`saved export ${base}/${day.date}`, () => {
      const dir = join(root, base, day.date);
      assertPackExport(day, dir);
      assertProjectExport(day, dir);
    });
  }
}
