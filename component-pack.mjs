// Versioned producer contract. Library acceptance is always a separate human decision.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export const PACKS_FROM = '2026-10-27';
export const DEFAULT_PACK_SIZE = 6;
export const CATEGORY_VERSION = 1;
export const CATEGORIES = ['Actions', 'Inputs', 'Navigation', 'Content', 'Feedback', 'Data', 'Layout', 'Media'];
export const ROLE_MAPPING = { button: 'Actions', input: 'Inputs', nav: 'Navigation', card: 'Content',
  loader: 'Feedback', feedback: 'Feedback', dataviz: 'Data', background: 'Layout', hero: 'Content',
  'text-effect': null, decoration: null, cursor: null, '3d': null };
const text = (x) => typeof x === 'string' && x.trim().length > 0 && x.length <= 1500;
const slug = (x) => typeof x === 'string' && /^[a-z][a-z0-9-]{1,63}$/.test(x);
const key = (x) => String(x).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const meaning = (x) => new Set(key(x).split(' ').filter((w) => !['a', 'an', 'the', 'to', 'for', 'of', 'with', 'component'].includes(w)));
const similarity = (a, b) => { const x = meaning(a), y = meaning(b); return [...x].filter((w) => y.has(w)).length / Math.max(x.size, y.size, 1); };
const url = (x) => { try { const u = new URL(x); return u.protocol === 'https:' && !u.username && !u.password; } catch { return false; } };
export const hash = (x) => createHash('sha256').update(typeof x === 'string' || Buffer.isBuffer(x) ? x : JSON.stringify(x)).digest('hex');

export function parsePack(text) {
  const blocks = [...text.matchAll(/```json\s*\n([\s\S]*?)```/g)];
  if (blocks.length !== 1) throw new Error('pack plan needs exactly one fenced JSON contract');
  return JSON.parse(blocks[0][1]);
}

export function packProblems(pack, count) {
  const p = [];
  if (!pack || typeof pack !== 'object' || Array.isArray(pack)) return ['pack must be an object'];
  if (pack.schemaVersion !== 1 || pack.categoryVersion !== CATEGORY_VERSION) p.push('unsupported pack/category version');
  if (!slug(pack.id)) p.push('invalid pack id');
  for (const f of ['name', 'description', 'project', 'sizeRationale']) if (!text(pack[f])) p.push(`missing pack ${f}`);
  const t = pack.tokens;
  for (const theme of ['dark', 'light']) for (const f of ['bg', 'surface', 'text', 'muted', 'accent', 'border']) {
    if (typeof t?.colors?.[theme]?.[f] !== 'string' || !/^#[a-f0-9]{6}$/i.test(t.colors[theme][f])) p.push(`invalid ${theme} color ${f}`);
  }
  const tokenRules = { typography: { family: /^[a-zA-Z0-9 ,"'-]{1,100}$/, size: /^\d{1,2}px$/ },
    spacing: { gap: /^\d{1,2}px$/, padding: /^\d{1,2}px$/ }, radii: { control: /^\d{1,2}px$/ },
    motion: { duration: /^\d{1,3}ms$/, easing: /^(ease|ease-out|ease-in-out|linear)$/ } };
  const shape = (o, keys) => o && typeof o === 'object' && !Array.isArray(o)
    && Object.keys(o).length === keys.length && Object.keys(o).every((k) => keys.includes(k));
  if (!shape(t, ['colors', ...Object.keys(tokenRules)]) || !shape(t?.colors, ['dark', 'light'])) p.push('unknown or missing token groups');
  for (const theme of ['dark', 'light']) if (!shape(t?.colors?.[theme], ['bg', 'surface', 'text', 'muted', 'accent', 'border'])) p.push(`unknown ${theme} token`);
  for (const [g, fields] of Object.entries(tokenRules)) if (!shape(t?.[g], Object.keys(fields))) p.push(`unknown ${g} token`);
  for (const [g, fields] of Object.entries(tokenRules)) for (const [f, rule] of Object.entries(fields)) {
    if (typeof t?.[g]?.[f] !== 'string' || !rule.test(t[g][f])) p.push(`invalid token ${g}.${f}`);
  }
  const cs = pack.components;
  if (!Array.isArray(cs) || !cs.length || cs.length > 10 || (count !== undefined && cs.length !== count)) return [...p, 'component count does not match requested size (1–10)'];
  const seen = { id: new Set(), purpose: new Set(), mechanism: new Set(), file: new Set() };
  cs.forEach((c, i) => {
    if (!c || typeof c !== 'object') { p.push(`component ${i + 1} must be an object`); return; }
    const at = `component ${i + 1}`;
    if (!slug(c.id)) p.push(`${at}: invalid id`);
    if (c.row !== i + 1) p.push(`${at}: row must follow list order`);
    if (c.file !== `artifact-${i + 1}.html`) p.push(`${at}: invalid file path`);
    if (!CATEGORIES.includes(c.category)) p.push(`${at}: unknown category`);
    for (const f of ['name', 'description', 'purpose', 'use', 'input', 'outcome', 'recovery', 'mechanism', 'nearestAnalogue', 'usefulness', 'creativeDifference']) {
      if (!text(c[f])) p.push(`${at}: missing ${f}`);
    }
    if (!Array.isArray(c.tags) || !c.tags.length || c.tags.length > 12 || !c.tags.every(slug)) p.push(`${at}: invalid tags`);
    if (!Array.isArray(c.states) || !c.states.length || !c.states.every(text)) p.push(`${at}: missing states`);
    if (!Array.isArray(c.sources) || !c.sources.length || c.sources.length > 5 || !c.sources.every((s) => text(s?.title) && url(s?.url))) p.push(`${at}: missing safe source attribution`);
    for (const f of Object.keys(seen)) {
      const v = key(c[f]);
      if (seen[f].has(v)) p.push(`${at}: overlapping ${f}`);
      seen[f].add(v);
    }
    for (const old of cs.slice(0, i).filter(Boolean)) for (const f of ['purpose', 'mechanism']) {
      if (key(old[f]) !== key(c[f]) && similarity(old[f], c[f]) >= 0.8) p.push(`${at}: overlapping ${f} with ${old.id}`);
    }
  });
  if (pack.demo?.file !== 'piece.html' || !text(pack.demo?.sharedState)
    || !Array.isArray(pack.demo?.rows) || JSON.stringify(pack.demo.rows) !== JSON.stringify(cs.map((c) => c?.row))) p.push('demo must connect every component through named shared state');
  if (!Array.isArray(pack.opportunities) || !pack.opportunities.length || pack.opportunities.length > 5
    || !pack.opportunities.every((o) => ['id', 'need', 'use', 'interaction', 'similarity'].every((f) => text(o?.[f])))) p.push('missing opportunity shortlist rationale');
  if (!Array.isArray(pack.opportunities) || !pack.opportunities.some((o) => o?.id === pack.selection?.id) || !text(pack.selection?.rationale)) p.push('missing selected opportunity rationale');
  return p;
}

export function packInputProblems(pack, input, custom = false) {
  const allowed = new Set(input.candidates.map((c) => c.id));
  const problems = [];
  if (Array.isArray(pack.opportunities) && pack.opportunities.some((o) => !allowed.has(o?.id))) problems.push('shortlist references unknown input opportunity');
  if (input.requiredKind && input.candidates.find(c => c.id === pack.selection?.id)?.kind !== input.requiredKind) problems.push(`edition must select a ${input.requiredKind} opportunity`);
  if (custom && pack.selection?.id !== 'daily-task') problems.push('explicit custom brief must be selected');
  return problems;
}

export function recentPacks(daysDir, date) {
  if (!existsSync(daysDir)) return [];
  return readdirSync(daysDir).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)
    && (Date.parse(date) - Date.parse(d)) / 86400000 > 0 && (Date.parse(date) - Date.parse(d)) / 86400000 <= 28)
    .sort().flatMap((d) => {
      try { const day = JSON.parse(readFileSync(join(daysDir, d, 'day.json'), 'utf8')); return day.status === 'failed' ? [] : [{ date: d,
        task: day.task, ...(day.project ? { project: day.project } : {}), components: day.pack?.components || [], usedSources: day.planning?.selectedSourceIds || [] }]; }
      catch { return []; }
    });
}

export function repetitionWarnings(pack, recent) {
  const warnings = [];
  for (const c of pack.components) for (const day of recent) for (const old of day.components) {
    for (const f of ['purpose', 'mechanism']) {
      if (similarity(c[f], old[f]) >= 0.7) warnings.push(`${c.id}: similar ${f} to ${day.date}/${old.id}`);
    }
  }
  return [...new Set(warnings)];
}

export function tokenCss(tokens) {
  const rest = Object.entries(tokens).filter(([g]) => g !== 'colors').flatMap(([g, fields]) =>
    Object.entries(fields).map(([k, v]) => `--pack-${g}-${k}:${v}`)).join(';');
  const colors = (theme) => Object.entries(tokens.colors[theme]).map(([k, v]) => `--pack-${k}:${v}`).join(';');
  return `:root{${rest};${colors('dark')}}:root[data-theme="light"]{${colors('light')}}`;
}

export function applyTokens(html, tokens) {
  return html.replace(/<\/head>/i, `<style data-pack-tokens>${tokenCss(tokens)}</style></head>`);
}

export function packArtifactProblems(html) {
  const p = [];
  if (!/<head\b[^>]*>[\s\S]*<\/head>/i.test(html)) p.push('missing complete head for shared token injection');
  for (const name of ['bg', 'text', 'accent', 'typography-family', 'spacing-gap', 'radii-control', 'motion-duration']) {
    if (!html.includes(`var(--pack-${name})`)) p.push(`does not use shared token --pack-${name}`);
  }
  if (/--pack-[\w-]+\s*:/.test(html)) p.push('redefines shared pack tokens');
  return p;
}

export function makeManifest(day) {
  const problems = packProblems(day.pack);
  if (problems.length) throw new Error(`invalid pack: ${problems.join('; ')}`);
  const prefix = `${day.date}${day.edition ? `-${day.edition.lane}` : ''}-${day.pack.id}`;
  return { ...day.pack, ...(day.edition ? { edition: day.edition } : {}), id: prefix, date: day.date, reviewStatus: 'needs-review',
    inputHash: day.planning?.inputHash, warnings: day.packWarnings || [],
    components: day.pack.components.map((c) => {
      const a = day.artifacts.find((a) => a.row === c.row);
      return { ...c, id: `${prefix}-${c.id}`, packId: prefix,
        reviewStatus: 'needs-review', libraryAcceptance: 'unreviewed',
        generationStatus: a?.status || 'not-built', problems: a?.problems || [], sha256: a?.sha256 || null };
    }), demo: { ...day.pack.demo, generationStatus: day.artifacts.find((a) => a.kind === 'piece')?.status || 'not-built' } };
}

export function assertPackExport(day, dir) {
  if (!day.pack) {
    if (day.packMode && day.status !== 'failed') throw new Error('pack record missing contract');
    return;
  }
  if (day.status === 'building') throw new Error('pack generation still incomplete');
  const manifest = makeManifest(day);
  for (const f of ['pack.json', 'tokens.json']) if (!existsSync(join(dir, f))) throw new Error(`missing ${f}`);
  if (JSON.stringify(manifest) !== JSON.stringify(JSON.parse(readFileSync(join(dir, 'pack.json'), 'utf8')))) throw new Error('pack manifest differs from record');
  if (JSON.stringify(day.pack.tokens) !== JSON.stringify(JSON.parse(readFileSync(join(dir, 'tokens.json'), 'utf8')))) throw new Error('pack tokens differ from record');
  const input = JSON.parse(readFileSync(join(dir, 'planning-input.json'), 'utf8'));
  if (hash(input) !== day.planning?.inputHash || input.date !== day.date) throw new Error('planning input hash/date mismatch');
  const rows = new Set();
  let demos = 0;
  for (const a of day.artifacts) {
    if (a.kind === 'piece') { if (a.file !== 'piece.html') throw new Error('unexpected demo path'); demos++; continue; }
    const c = day.pack.components.find((c) => c.row === a.row);
    if (!c || c.file !== a.file || rows.has(a.row)) throw new Error('unexpected/duplicate component artifact');
    rows.add(a.row);
  }
  if (!Number.isInteger(day.requestedArtifacts) || day.requestedArtifacts < 0 || day.requestedArtifacts > 10
    || rows.size !== day.requestedArtifacts || demos !== (day.requestedArtifacts ? 1 : 0)) throw new Error('incomplete pack artifact record');
  for (const a of day.artifacts.filter((a) => a.status !== 'failed')) {
    if (!/^(artifact-\d+|piece)\.html$/.test(a.file)) throw new Error('unsafe artifact path');
    if (!a.sha256 || hash(readFileSync(join(dir, a.file))) !== a.sha256) throw new Error(`artifact hash mismatch: ${a.file}`);
  }
}

export function packBuildRules(pack, row) {
  return `${row === 'demo' ? 'Assemble the connected project from every supplied component.' : `Build standalone component ${row}; use only its purpose and mechanism.`} Shared pack contract:\n${JSON.stringify(pack)}\n`
    + 'Use var(--pack-bg), var(--pack-surface), var(--pack-text), var(--pack-muted), var(--pack-accent), var(--pack-border), '
    + 'var(--pack-typography-family), var(--pack-typography-size), var(--pack-spacing-gap), var(--pack-spacing-padding), '
    + 'var(--pack-radii-control), var(--pack-motion-duration), var(--pack-motion-easing). Never declare --pack-* variables; runner injects them. '
    + 'Keep data-theme on html. Show useful independent sample state. References inspire, never copy source code.\n';
}
