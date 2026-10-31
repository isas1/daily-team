// Project discovery and evidence contract; no additional model request.
import { FEED_SOURCES } from './feed-planning.mjs';
import { hash, parsePack } from './component-pack.mjs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const PROJECTS_FROM = '2026-10-31';
export const PROJECT_SOURCES = [
  { id: 'github-trending', name: 'GitHub Trending (weekly, observed)', url: 'https://github.com/trending?since=weekly', format: 'trending', enabled: true },
  ...FEED_SOURCES.filter(s => s.enabled),
  { id: 'reddit-sideproject', name: 'Reddit r/SideProject', url: 'https://www.reddit.com/r/SideProject/.rss', enabled: true },
  { id: 'reddit-beautiful', name: 'Reddit r/InternetIsBeautiful', url: 'https://www.reddit.com/r/InternetIsBeautiful/.rss', enabled: true },
  { id: 'github-blog', name: 'GitHub Blog', url: 'https://github.blog/feed/', enabled: false,
    reason: '2026-10-31: feed contains declarations rejected by restricted XML reader' },
];

const family = item => String(item.sourceId).replace(/^reddit-.*/, 'reddit').replace(/^github-.*/, 'github');

export function projectInput({ date, discovery, recent, brief = '' }) {
  const task = brief || 'Create one original, useful interactive project from current signals. Choose a real audience and need; turn cross-domain ideas into a working offline prototype.';
  const fresh = discovery.items.filter(i => {
    const age = (Date.parse(date) - Date.parse(i.published)) / 86400000;
    return age >= -1 && age <= 14;
  });
  return { schemaVersion: 1, mode: 'project', date, task, request: null,
    sources: discovery.status, custom: Boolean(brief),
    candidates: [...fresh.map(i => ({ ...i, kind: 'feed' })), { id: 'daily-task', kind: 'task', task }],
    recent, inventory: null };
}

const words = s => new Set(String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ')
  .filter(w => w.length > 2 && !['the', 'and', 'for', 'with', 'from', 'that', 'this'].includes(w)));
const overlap = (a, b) => { const x = words(a), y = words(b); return [...x].filter(w => y.has(w)).length / Math.max(x.size, y.size, 1); };

export function projectProblems(project, input) {
  if (!project || typeof project !== 'object' || Array.isArray(project)) return ['project must be an object'];
  const problems = [];
  if (project.schemaVersion !== 1) problems.push('unsupported project version');
  for (const key of ['name', 'audience', 'problem', 'interaction', 'outcome', 'recovery', 'mechanism', 'difference', 'whyNow']) {
    if (typeof project[key] !== 'string' || !project[key].trim() || project[key].length > 1200) problems.push(`missing or oversized project ${key}`);
  }
  const feeds = input.candidates.filter(c => c.kind === 'feed');
  const ids = project.sourceIds;
  if (!Array.isArray(ids) || ids.length > 5 || new Set(ids).size !== ids.length || ids.some(id => !feeds.some(c => c.id === id))) {
    problems.push('project sources must reference unique saved feed IDs');
  } else {
    const minimum = input.custom ? 0 : Math.min(2, new Set(feeds.map(family)).size);
    if (new Set(ids.map(id => family(feeds.find(c => c.id === id)))).size < minimum) problems.push('use signals from two available source families');
    if (!input.custom && feeds.length && !ids.length) problems.push('available trend evidence must inform project');
  }
  if (typeof project.evidenceStatus !== 'string' || project.evidenceStatus !== (ids?.length ? 'sourced' : 'original-fallback')) problems.push('project evidence status must match actual sources');
  if (!Array.isArray(project.alternatives) || project.alternatives.length !== 3
    || project.alternatives.some(a => !a || ['name', 'need', 'mechanism', 'rejection'].some(k => typeof a[k] !== 'string' || !a[k].trim() || a[k].length > 1200))) problems.push('compare three concrete directions with rejection rationale');
  else if (['name', 'mechanism'].some(key => new Set(project.alternatives.map(a => a[key].toLowerCase().replace(/\s+/g, ' ').trim())).size !== 3)) problems.push('project directions must have distinct names and mechanisms');
  for (const day of input.recent) {
    const old = day.project;
    if (old && (overlap(project.name, old.name) === 1
      || (overlap(project.problem, old.problem) >= 0.75 && overlap(project.mechanism, old.mechanism) >= 0.75))) problems.push(`project repeats ${day.date}; change need and mechanism`);
  }
  return problems;
}

export const parseProject = parsePack; // Same exactly-one fenced JSON parser.

export function assertProjectExport(day, dir) {
  if (!day.projectMode) return;
  if (day.status === 'building') throw new Error('project generation still incomplete');
  const input = JSON.parse(readFileSync(join(dir, 'planning-input.json'), 'utf8'));
  if (input.mode !== 'project' || input.date !== day.date || hash(input) !== day.planning?.inputHash) throw new Error('project input hash/date mismatch');
  if (day.status === 'failed') return;
  const problems = projectProblems(day.project, input);
  if (problems.length) throw new Error(`invalid project: ${problems.join('; ')}`);
  if (JSON.stringify(day.project.sourceIds) !== JSON.stringify(day.planning.selectedSourceIds)) throw new Error('project source receipt mismatch');
  if (![0, 1].includes(day.requestedArtifacts) || day.artifacts.length !== day.requestedArtifacts) throw new Error('incomplete project artifact record');
  for (const a of day.artifacts) {
    if (a.file !== 'artifact-1.html') throw new Error('unsafe project artifact path');
    if (a.status !== 'failed' && (!a.sha256 || hash(readFileSync(join(dir, a.file))) !== a.sha256)) throw new Error('project artifact hash mismatch');
  }
}
