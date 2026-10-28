// Read-only catalog audit; never migrates library records.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATEGORIES, ROLE_MAPPING, hash } from './component-pack.mjs';

export function auditInventory(root) {
  const catBytes = readFileSync(join(root, 'catalog.json'));
  const taxBytes = readFileSync(join(root, 'taxonomy.json'));
  const catalog = JSON.parse(catBytes), taxonomy = JSON.parse(taxBytes);
  const themes = catalog.tileThemes || [], counts = Object.fromEntries(CATEGORIES.map((c) => [c, 0]));
  const mapping = themes.map((theme) => {
    const role = taxonomy.seedThemeMap?.[theme.slug]?.role;
    const category = ROLE_MAPPING[role] || null;
    const count = (theme.items || []).length;
    if (category) counts[category] += count;
    return { theme: theme.slug, count, role: role || null, proposedCategory: category,
      reviewRequired: true, reason: category ? 'Theme-level hint only; individual item purpose needs review' : 'Art-only or unknown role; do not force a functional category' };
  });
  return { schemaVersion: 1, sourceHash: hash(catBytes), taxonomyHash: hash(taxBytes),
    source: 'isas1/web-components catalog.json and taxonomy.json; local read-only snapshot',
    totals: catalog.totals, producerCategories: CATEGORIES, roleMapping: ROLE_MAPPING, counts,
    gaps: Object.entries(counts).sort((a, b) => a[1] - b[1]).slice(0, 3).map(([category, count]) =>
      ({ category, count, reason: 'Low theme-mapped count; provisional opportunity, not a proven inventory gap' })), mapping,
    limitations: ['No item migration or production writes', 'Theme labels are not reliable per-item categories',
      'Gallery components and paid pack exclusives require separate review', 'All assignments are proposals requiring human review'] };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [root, out] = process.argv.slice(2);
  if (!root || !out) throw new Error('usage: node inventory-audit.mjs <library-root> <output.json>');
  writeFileSync(out, `${JSON.stringify(auditInventory(root), null, 2)}\n`);
}
