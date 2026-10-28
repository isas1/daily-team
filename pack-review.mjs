// Explicit human library-outcome ledger. Does not approve, import or publish code.
// node pack-review.mjs <day-dir> <component-id> accepted|rejected <evidence-url> <note>
// node pack-review.mjs --report <days-dir>
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertPackExport, hash, makeManifest } from './component-pack.mjs';

export function recordLibraryOutcome(dir, id, decision, evidenceUrl, note) {
  const day = JSON.parse(readFileSync(join(dir, 'day.json'), 'utf8'));
  assertPackExport(day, dir);
  const matches = makeManifest(day).components.filter((c) => c.id === id || c.id.endsWith(`-${id}`));
  if (matches.length !== 1) throw new Error('provide an unambiguous component ID');
  const component = matches[0];
  if (!component || component.generationStatus !== 'ok' || !component.sha256) throw new Error('component must exist and pass source checks before outcome tracking');
  if (!['accepted', 'rejected'].includes(decision)) throw new Error('decision must be accepted or rejected');
  const url = new URL(evidenceUrl);
  if (url.protocol !== 'https:' || url.username || url.password || !note?.trim() || note.length > 1500) throw new Error('provide HTTPS evidence URL and concise review note');
  const file = join(dir, 'library-review.json');
  const ledger = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { schemaVersion: 1, events: [] };
  if (ledger.schemaVersion !== 1 || !Array.isArray(ledger.events)) throw new Error('invalid outcome ledger');
  ledger.events.push({ componentId: component.id, sha256: component.sha256, decision, evidenceUrl: url.href, note: note.trim(), recordedAt: new Date().toISOString() });
  writeFileSync(file, `${JSON.stringify(ledger, null, 2)}\n`);
  return ledger.events.at(-1);
}

export function libraryOutcomes(daysDir) {
  const result = { generated: 0, accepted: 0, rejected: 0, unreviewed: 0, stale: 0 };
  for (const date of existsSync(daysDir) ? readdirSync(daysDir).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)) : []) {
    const dir = join(daysDir, date), file = join(dir, 'day.json');
    if (!existsSync(file)) continue;
    const day = JSON.parse(readFileSync(file, 'utf8'));
    if (!day.pack) continue;
    const ledger = existsSync(join(dir, 'library-review.json')) ? JSON.parse(readFileSync(join(dir, 'library-review.json'), 'utf8')) : { events: [] };
    for (const component of makeManifest(day).components) {
      const a = day.artifacts.find((a) => a.row === component.row);
      if (!a || a.status === 'failed') continue;
      result.generated++;
      const latest = ledger.events.filter((e) => e.componentId === component.id).at(-1);
      if (!latest) result.unreviewed++;
      else if (!existsSync(join(dir, component.file)) || hash(readFileSync(join(dir, component.file))) !== latest.sha256 || latest.sha256 !== component.sha256) result.stale++;
      else if (['accepted', 'rejected'].includes(latest.decision)) result[latest.decision]++;
      else throw new Error('invalid ledger decision');
    }
  }
  return result;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const result = args[0] === '--report' ? libraryOutcomes(args[1] || 'days') : recordLibraryOutcome(...args);
  console.log(JSON.stringify(result, null, 2));
}
