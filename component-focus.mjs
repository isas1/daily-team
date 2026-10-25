// Small, portable briefs distilled from 00-components. Source files are inspiration,
// not approved implementations; generation must improve their states, motion and fit.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const focusGuide = () => JSON.parse(readFileSync(join(HERE, 'component-inspiration.json'), 'utf8'));

// A request can be used again after 28 days, or for another explicitly scoped brief.
// Failed days do not consume it. No model call or GitHub mutation is needed here.
export function chooseRequest(date, requests, daysDir) {
  const guide = focusGuide();
  const recent = new Set();
  if (existsSync(daysDir)) for (const day of readdirSync(daysDir)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    const age = (Date.parse(date) - Date.parse(day)) / 86_400_000;
    const file = join(daysDir, day, 'day.json');
    if (age <= 0 || age > 28 || !existsSync(file)) continue;
    const record = JSON.parse(readFileSync(file, 'utf8'));
    if (record.status !== 'failed' && record.request) recent.add(`${record.request.url}\n${record.task}`);
  }
  const candidates = requests.flatMap((request) => {
    const source = String(request.url || '').match(/^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/issues\/(\d+)$/);
    if (!source) return [];
    const briefs = guide.issueBriefs.filter((b) => b.url === request.url);
    const tasks = briefs.length ? briefs.map((b) => b.task)
      : [request.task || `Requested component: a reusable UI component for this request: ${String(request.title || '').slice(0, 130)}.`];
    return tasks.filter((task) => !recent.has(`${request.url}\n${task}`))
      .map((task) => ({ ...request, repository: source[1], number: Number(source[2]), task }));
  });
  // Caller sorts demand by votes; rotate equal-priority briefs deterministically.
  if (!candidates.length) return null;
  const votes = Math.max(...candidates.map((r) => Number(r.votes) || 0));
  const top = candidates.filter((r) => (Number(r.votes) || 0) === votes);
  const day = Math.floor(Date.parse(date) / 86_400_000);
  return top[day % top.length];
}

export function inspirationContext() {
  return `<component_inspiration note="reference ideas, not code to copy">\n${JSON.stringify(focusGuide().references)}\n</component_inspiration>`;
}
