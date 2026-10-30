// Two-night experiment. Separate records; no overwrite of normal daily output.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { discover, planningInput } from './feed-planning.mjs';
import { recentPacks } from './component-pack.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const DATES = ['2026-10-30', '2026-10-31'];
export const LANES = ['news', 'culture', 'popular'];
export const SLOTS = { '30 0 * * *': 'news', '30 2 * * *': 'culture', '30 4 * * *': 'popular' };
export const CULTURES = {
  '2026-10-30': { name: 'Japanese sashiko repair craft', url: 'https://www.vam.ac.uk/dundee/whatson/events/stitch-style-sashiko',
    idea: 'Visible repair and reinforcement stitching: repairable workflows, measured repeated marks and honest progress.' },
  '2026-10-31': { name: 'Portuguese azulejo pattern craft', url: 'https://estudoautonomo.dge.mec.pt/recurso/padroes-e-uma-visita-ao-museu-nacional-do-azulejo',
    idea: 'Modular pattern construction: repetition, rotation, borders and local changes forming one coherent whole.' },
};
export function slot(now = new Date(), cron = '') {
  const date = now.toISOString().slice(0, 10), lane = SLOTS[cron];
  return { date, lane: lane || '', due: DATES.includes(date) && Boolean(lane) };
}
export async function editionInput(date, lane, { root = HERE, fetcher = fetch, offline = false } = {}) {
  if (!DATES.includes(date) || !LANES.includes(lane)) throw new Error('edition outside approved two-night window or unknown lane');
  const recent = [...recentPacks(join(root, 'days'), date), ...recentPacks(join(root, 'editions', lane, 'days'), date)];
  const task = lane === 'news' ? 'Create a practical original component pack inspired by one supplied news/feed article. Choose a feed candidate and explain its useful transformation.'
    : lane === 'culture' ? `Create a creative, useful component set informed specifically by ${CULTURES[date].name}. ${CULTURES[date].idea} Translate craft principles into distinct interactions, not decorative stereotypes. Use original work, avoid sacred imagery and claims of cultural authenticity. Cite ${CULTURES[date].url}.`
    : 'Expand the most popular Forever components into a coherent useful project. Extend their mechanisms with distinct companion components and new states, not palette-only variants. Use the supplied dated community ranking snapshot; do not claim fresh live rankings or library acceptance.';
  const discovery = lane === 'news' ? await discover({ date, cacheFile: join(root, '.cache', 'feed-backlog.json'), recent, fetcher, offline })
    : { items: [], status: [{ source: 'all', status: `${lane}-brief` }] };
  const input = planningInput({ date, task, request: null, discovery, recent });
  input.requiredKind = lane === 'news' ? 'feed' : 'task';
  if (lane === 'news' && !input.candidates.some(c => c.kind === 'feed')) throw new Error('news edition has no eligible feed candidates; no task fallback allowed');
  input.edition = { lane, date, timezone: 'Europe/Lisbon', ...(lane === 'culture' ? { culture: CULTURES[date] } : {}) };
  if (lane === 'popular') {
    const snapshot = JSON.parse(readFileSync(join(root, 'docs', 'popular-snapshot-2026-10-30.json'), 'utf8'));
    input.edition.popularSnapshot = snapshot;
    input.task += ` Seeds: ${snapshot.components.map(c => `${c.name} (rank ${c.rank}, displayed score ${c.displayedScore})`).join('; ')}. Source: ${snapshot.url}.`;
    input.candidates.find(c => c.id === 'daily-task').task = input.task;
  }
  return input;
}
async function main() {
  const [cmd, lane, date] = process.argv.slice(2);
  if (cmd === 'slot') {
    const s = slot(new Date(), process.env.SCHEDULE || '');
    console.log(`due=${s.due}\ndate=${s.date}\nlane=${s.lane}`); return;
  }
  if (cmd !== 'run') throw new Error('usage: node editions.mjs slot | run news|culture|popular YYYY-MM-DD');
  if (!DATES.includes(date) || !LANES.includes(lane)) throw new Error('edition outside approved window');
  const out = join(HERE, 'editions', lane, 'days'), dir = join(out, date);
  const record = join(dir, 'day.json'), snapshot = join(dir, 'planning-input.json');
  if (existsSync(record) && JSON.parse(readFileSync(record, 'utf8')).status !== 'failed') {
    console.log(`${date}/${lane} already recorded; not regenerating`); return;
  }
  if (!existsSync(snapshot)) {
    const input = await editionInput(date, lane);
    mkdirSync(dir, { recursive: true }); writeFileSync(snapshot, JSON.stringify(input, null, 2) + '\n');
  }
  // Snapshot owns lane task. No issue/source-bank snapshot can replace it.
  execFileSync(process.execPath, [join(HERE, 'run.mjs'), '--pack', '--date', date, '--out', out, '--snapshot', snapshot, '--artifacts', '6'],
    { stdio: 'inherit', env: { ...process.env, COMPONENT_REQUESTS_FILE: '', COMPONENT_SOURCES_FILE: '', COMPONENTS_DIR: '' } });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e.message); process.exitCode = 1; });
