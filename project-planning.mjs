// Project discovery and evidence contract; no additional model request.
import { FEED_SOURCES } from './feed-planning.mjs';
import { hash, parsePack } from './component-pack.mjs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { solutionCaseProblems, validSolutionReceipt } from './solution-check.mjs';

export const PROJECTS_FROM = '2026-10-31';
export const SOLUTIONS_FROM = '2026-11-19';
export const PROJECT_SOURCES = [
  { id: 'github-trending', name: 'GitHub Trending (weekly, observed)', url: 'https://github.com/trending?since=weekly', format: 'trending', enabled: true },
  ...FEED_SOURCES.filter(s => s.enabled),
  { id: 'reddit-sideproject', name: 'Reddit r/SideProject', url: 'https://www.reddit.com/r/SideProject/.rss', enabled: true },
  { id: 'reddit-beautiful', name: 'Reddit r/InternetIsBeautiful', url: 'https://www.reddit.com/r/InternetIsBeautiful/.rss', enabled: true },
  { id: 'github-blog', name: 'GitHub Blog', url: 'https://github.blog/feed/', enabled: false,
    reason: '2026-10-31: feed contains declarations rejected by restricted XML reader' },
];

export const SOLUTION_FEEDS = PROJECT_SOURCES.filter(s => s.enabled && !s.id.startsWith('reddit-'));

export function reviewedProblems(file, date, recent) {
  const used = new Set(recent.flatMap(day => day.usedSources));
  const entries = JSON.parse(readFileSync(file, 'utf8'));
  if (!Array.isArray(entries)) throw new Error('problem briefs must be an array');
  const unique = new Map();
  for (const { reviewed, url, title, problem, workaround, gap } of entries) {
    // Use only the canonical post ID in the receipt and keep post bodies out of snapshots.
    const match = typeof url === 'string' && url.match(/^https:\/\/www\.reddit\.com\/r\/([\w]+)\/comments\/([a-z0-9]+)\/$/i);
    if (!match || ![title, problem, workaround, gap].every(shortText) || !/^\d{4}-\d{2}-\d{2}$/.test(reviewed)
      || !Number.isFinite(Date.parse(reviewed)) || new Date(reviewed).toISOString().slice(0, 10) !== reviewed) throw new Error('invalid reviewed Reddit problem');
    const age = (Date.parse(date) - Date.parse(reviewed)) / 86400000;
    const id = 'reddit-' + match[2].toLowerCase();
    if (age >= 0 && age <= 90 && !used.has(id) && !unique.has(id)) {
      unique.set(id, { id, kind: 'reviewed', sourceId: 'reddit-reviewed', source: `Reddit r/${match[1]}`, reviewed, url, title, problem, workaround, gap });
    }
  }
  return [...unique.values()].slice(0, 10);
}

const family = item => String(item.sourceId).replace(/^reddit-.*/, 'reddit').replace(/^github-.*/, 'github');

// Stable UTC date rotation; disabled sources never enter the cycle.
export function projectSource(date) {
  const enabled = PROJECT_SOURCES.filter(s => s.enabled);
  const day = Math.floor(Date.parse(`${date}T00:00:00Z`) / 86400000);
  if (!Number.isFinite(day)) throw new Error('invalid project date');
  return enabled[((day % enabled.length) + enabled.length) % enabled.length];
}

export function projectInput({ date, discovery, recent, brief = '', source = null, problemBriefs = [] }) {
  const solve = date >= SOLUTIONS_FROM;
  const task = brief || (solve
    ? 'Find a documented problem and build one offline tool that completes the real task. Use a reviewed brief if live leads lack a concrete problem.'
    : 'Create one original, useful interactive project from current signals. Choose a real audience and need; turn cross-domain ideas into a working offline prototype.');
  const fresh = discovery.items.filter(i => {
    const age = (Date.parse(date) - Date.parse(i.published)) / 86400000;
    return age >= -1 && age <= 14;
  });
  return { schemaVersion: 1, craftVersion: 1, mode: 'project', date, task, request: null,
    sources: discovery.status, custom: Boolean(brief), ...(source ? { feedPolicy: 'one-source-v1', selectedFeed: source.id } : {}),
    ...(solve ? { solutionVersion: 1 } : {}),
    candidates: [...(solve && !brief ? problemBriefs : []), ...fresh.map(i => ({ ...i, kind: 'feed' })), { id: 'daily-task', kind: 'task', task }],
    recent, inventory: null };
}

const words = s => new Set(String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ')
  .filter(w => w.length > 2 && !['the', 'and', 'for', 'with', 'from', 'that', 'this'].includes(w)));
const overlap = (a, b) => { const x = words(a), y = words(b); return [...x].filter(w => y.has(w)).length / Math.max(x.size, y.size, 1); };
const shortText = value => typeof value === 'string' && value.length <= 300 && /[\p{L}\p{N}]/u.test(value);
const directionKey = text => text.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

function craftProblems(project) {
  const problems = [];
  const { craft, alternatives } = project;
  for (const key of ['rule', 'design']) {
    if (!shortText(craft?.[key])) problems.push(`project craft.${key} needs a concrete description (1–300 characters)`);
  }
  for (const key of ['start', 'action', 'result', 'mistake', 'recovery']) {
    if (!shortText(craft?.trial?.[key])) problems.push(`project craft.trial.${key} needs a concrete example (1–300 characters)`);
  }
  if (!Array.isArray(alternatives) || alternatives.length !== 3) return problems;
  for (const key of ['action', 'result']) {
    if (!alternatives.every(a => shortText(a?.[key]))) {
      problems.push(`each project direction needs a concrete ${key} (1–300 characters)`);
    } else if (new Set(alternatives.map(a => directionKey(a[key]))).size !== 3) {
      problems.push(`project directions must have distinct ${key}s`);
    }
  }
  if (typeof project.name === 'string' && !alternatives.some(a => typeof a?.name === 'string'
    && directionKey(a.name) === directionKey(project.name))) problems.push('project name must match the chosen direction');
  return problems;
}

export function canDeclineProblem(input) {
  return input.solutionVersion === 1 && !input.custom && !input.candidates.some(c => c.kind === 'reviewed');
}

function solutionProblems(project, source) {
  const problems = solutionCaseProblems(project.cases);
  for (const key of ['workaround', 'gap', 'improvement']) {
    if (!shortText(project.proof?.[key])) problems.push(`project proof.${key} needs a concrete description (1–300 characters)`);
  }
  if (source?.kind === 'feed') {
    const normalize = value => String(value ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
    const signal = normalize(project.proof?.signal);
    if (!shortText(project.proof?.signal) || signal.length < 12
      || ![source.title, source.summary].some(value => normalize(value).includes(signal))) {
      problems.push('project proof.signal must quote at least 12 characters from the saved feed title or summary');
    }
  }
  return problems;
}

export function projectProblems(project, input) {
  if (!project || typeof project !== 'object' || Array.isArray(project)) return ['project must be an object'];
  const problems = [];
  if (project.schemaVersion !== 1) problems.push('unsupported project version');
  for (const key of ['name', 'audience', 'problem', 'interaction', 'outcome', 'recovery', 'mechanism', 'difference', 'whyNow']) {
    if (typeof project[key] !== 'string' || !project[key].trim() || project[key].length > 1200) problems.push(`missing or oversized project ${key}`);
  }
  const feeds = input.candidates.filter(c => c.kind === 'feed');
  const ids = project.sourceIds;
  if (input.solutionVersion === 1) {
    const source = Array.isArray(ids) && input.candidates.find(c => c.id === ids[0] && ['feed', 'reviewed'].includes(c.kind));
    if (!Array.isArray(ids) || (input.custom ? ids.length !== 0 : ids.length !== 1 || !source)) {
      problems.push('select exactly one saved problem source, or use the explicit brief');
    }
    problems.push(...solutionProblems(project, source));
  } else if (!Array.isArray(ids) || ids.length > 5 || new Set(ids).size !== ids.length || ids.some(id => !feeds.some(c => c.id === id))) {
    problems.push('project sources must reference unique saved feed IDs');
  } else {
    if (input.feedPolicy === 'one-source-v1') {
      if (!input.custom && (ids.length !== 1 || feeds.find(c => c.id === ids[0])?.sourceId !== input.selectedFeed)) problems.push('select exactly one item from the selected feed');
    } else {
      const minimum = input.custom ? 0 : Math.min(2, new Set(feeds.map(family)).size);
      if (new Set(ids.map(id => family(feeds.find(c => c.id === id)))).size < minimum) problems.push('use signals from two available source families');
      if (!input.custom && feeds.length && !ids.length) problems.push('available trend evidence must inform project');
    }
  }
  if (typeof project.evidenceStatus !== 'string' || project.evidenceStatus !== (ids?.length ? 'sourced' : 'original-fallback')) problems.push('project evidence status must match actual sources');
  if (!Array.isArray(project.alternatives) || project.alternatives.length !== 3
    || project.alternatives.some(a => !a || ['name', 'need', 'mechanism', 'rejection'].some(k => typeof a[k] !== 'string' || !a[k].trim() || a[k].length > 1200))) problems.push('compare three concrete directions with rejection rationale');
  else if (['name', 'mechanism'].some(key => new Set(project.alternatives.map(a => a[key].toLowerCase().replace(/\s+/g, ' ').trim())).size !== 3)) problems.push('project directions must have distinct names and mechanisms');
  if (input.craftVersion === 1) problems.push(...craftProblems(project));
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
  if (day.status === 'failed') {
    if (input.solutionVersion === 1 && day.artifacts.some(a => a.status !== 'failed')) throw new Error('failed solution exposes an artifact');
    return input;
  }
  const problems = projectProblems(day.project, input);
  if (problems.length) throw new Error(`invalid project: ${problems.join('; ')}`);
  if (JSON.stringify(day.project.sourceIds) !== JSON.stringify(day.planning.selectedSourceIds)) throw new Error('project source receipt mismatch');
  if (![0, 1].includes(day.requestedArtifacts) || day.artifacts.length !== day.requestedArtifacts) throw new Error('incomplete project artifact record');
  for (const a of day.artifacts) {
    if (a.file !== 'artifact-1.html') throw new Error('unsafe project artifact path');
    if (input.solutionVersion === 1 && (a.status !== 'ok' || !validSolutionReceipt(a.solutionCheck, day.project.cases, a.sha256))) {
      throw new Error('daily solution is missing its passing browser receipt');
    }
    if (a.status !== 'failed' && (!a.sha256 || hash(readFileSync(join(dir, a.file))) !== a.sha256)) throw new Error('project artifact hash mismatch');
  }
  return input;
}
