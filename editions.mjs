// Two-night news/popular experiment and daily non-repeating culture queue.
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
export const CULTURES = [
  { id: 'japanese', era: 'living', name: 'Japanese sashiko repair craft', url: 'https://www.vam.ac.uk/dundee/whatson/events/stitch-style-sashiko',
    idea: 'Visible repair and reinforcement stitching: repairable workflows, measured repeated marks and honest progress.' },
  { id: 'portuguese', era: 'living', name: 'Portuguese azulejo pattern craft', url: 'https://estudoautonomo.dge.mec.pt/recurso/padroes-e-uma-visita-ao-museu-nacional-do-azulejo',
    idea: 'Modular pattern construction: repetition, rotation, borders and local changes forming one coherent whole.' },
  { id: 'ancient-egyptian', era: 'historical', name: 'Ancient Egyptian faience craft', url: 'https://australian.museum/learn/cultures/international-collection/ancient-egyptian/egyptian-faience/', idea: 'Interpret material transformation as staged previews and finished states; use original abstract forms, not funerary symbols.' },
  { id: 'yoruba', era: 'living', name: 'Yoruba adire resist-dye craft', url: 'https://www.vam.ac.uk/articles/cloth-of-a-continent-africa-fashion', idea: 'Interpret resist dyeing as reversible masks, selective reveal and grouped editing; do not copy named symbolic motifs.' },
  { id: 'ancient-greek', era: 'historical', name: 'Ancient Greek Geometric-period pottery', url: 'https://www.namuseum.gr/en/collection/geometriki-periodos-3/', idea: 'Translate geometric registers into bounded information bands and rhythmic navigation, without reproducing funerary scenes.' },
  { id: 'asante', era: 'living', name: 'Asante kente strip weaving', url: 'https://www.vam.ac.uk/articles/cloth-of-a-continent-africa-fashion', idea: 'Translate narrow strips assembled into a whole into coordinated modular views; avoid copying status-bearing cloth designs.' },
  { id: 'roman', era: 'historical', name: 'Roman Imperial mosaic craft', url: 'https://www.metmuseum.org/art/collection/search/254536', idea: 'Interpret small tesserae forming a surface as composable cells, progressive assembly and local repair.' },
  { id: 'korean', era: 'living', name: 'Korean jogakbo wrapping cloth craft', url: 'https://www.vam.ac.uk/articles/jogakbo-traditional-korean-patchwork', idea: 'Interpret reused fabric pieces and sealed seams as adaptive partitions, useful grouping and explicit boundaries.' },
  { id: 'byzantine', era: 'historical', name: 'Byzantine silk weaving', url: 'https://www.metmuseum.org/art/collection/search/468141', idea: 'Interpret woven structure as interlocking layers and repeated units, using original abstract forms without religious or imperial insignia.' },
  { id: 'chinese', era: 'living', name: 'Chinese paper-cut craft', url: 'https://ich.unesco.org/en/RL/chinese-paper-cut-00219', idea: 'Interpret cutting and negative space as meaningful reveal, connected silhouettes and reversible filters; use original everyday motifs.' },
  { id: 'taquile-quechua', era: 'living', name: 'Taquile Quechua textile craft', url: 'https://ich.unesco.org/en/RL/el-arte-textil-de-taquile-00166', idea: 'Interpret woven seasonal cycles as readable timelines and coordinated planning; do not copy garments or social-status symbols.' },
  { id: 'indonesian', era: 'living', name: 'Indonesian batik craft', url: 'https://ich.unesco.org/en/RL/batik-indonesian-batik-00170', idea: 'Interpret repeated wax-resist stages as layered selections, previews and reversible operations; avoid ceremonial motifs.' },
];
export function cultureFor(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const timestamp = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== date) return null;
  const index = (timestamp - Date.parse(`${DATES[0]}T00:00:00Z`)) / 86400000;
  return CULTURES[index] || null;
}
export function allowedEdition(date, lane) {
  return LANES.includes(lane) && (lane === 'culture' ? Boolean(cultureFor(date)) : DATES.includes(date));
}
export function slot(now = new Date(), cron = '') {
  const date = now.toISOString().slice(0, 10), lane = SLOTS[cron];
  return { date, lane: lane || '', due: allowedEdition(date, lane) };
}
export async function editionInput(date, lane, { root = HERE, fetcher = fetch, offline = false } = {}) {
  if (!allowedEdition(date, lane)) throw new Error('edition outside approved window, culture queue exhausted, or unknown lane');
  const culture = cultureFor(date);
  const recent = [...recentPacks(join(root, 'days'), date), ...recentPacks(join(root, 'editions', lane, 'days'), date)];
  const task = lane === 'news' ? 'Create a practical original component pack inspired by one supplied news/feed article. Choose a feed candidate and explain its useful transformation.'
    : lane === 'culture' ? `Create a creative, useful component set informed specifically by ${culture.name}. ${culture.idea} Translate craft principles into distinct interactions, not decorative stereotypes. Use original work, avoid sacred imagery and claims of cultural authenticity. Cite ${culture.url}.`
    : 'Expand the most popular Forever components into a coherent useful project. Extend their mechanisms with distinct companion components and new states, not palette-only variants. Use the supplied dated community ranking snapshot; do not claim fresh live rankings or library acceptance.';
  const discovery = lane === 'news' ? await discover({ date, cacheFile: join(root, '.cache', 'feed-backlog.json'), recent, fetcher, offline })
    : { items: [], status: [{ source: 'all', status: `${lane}-brief` }] };
  const input = planningInput({ date, task, request: null, discovery, recent });
  input.requiredKind = lane === 'news' ? 'feed' : 'task';
  if (lane === 'news' && !input.candidates.some(c => c.kind === 'feed')) throw new Error('news edition has no eligible feed candidates; no task fallback allowed');
  input.edition = { lane, date, timezone: 'Europe/Lisbon', ...(lane === 'culture' ? { culture } : {}) };
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
  if (!allowedEdition(date, lane)) throw new Error('edition outside approved window or culture queue exhausted');
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
