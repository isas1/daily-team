// Bounded RSS/Atom discovery; no reference code executes and no extra model call is made.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { hash } from './component-pack.mjs';

export const FEED_SOURCES = [
  { id: 'smashing', name: 'Smashing Magazine', url: 'https://www.smashingmagazine.com/feed/', enabled: true },
  { id: 'hacker-news', name: 'Hacker News', url: 'https://news.ycombinator.com/rss', enabled: true },
  { id: 'codrops', name: 'Codrops', url: 'https://tympanus.net/codrops/feed/', enabled: false,
    reason: '2026-10-27: endpoint returns HTTP 410; awaiting verified replacement' },
];
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_ITEMS = 20;
const safeUrl = (x) => { try { const u = new URL(x); if (u.protocol !== 'https:' || u.username || u.password) return null;
  u.hash = ''; for (const k of [...u.searchParams.keys()]) if (/^utm_|^fbclid$/.test(k)) u.searchParams.delete(k); return u.href;
} catch { return null; } };
const decode = (s) => s.replace(/&#(x[\da-f]+|\d+);/gi, (_, n) => {
  const code = n[0].toLowerCase() === 'x' ? parseInt(n.slice(1), 16) : Number(n);
  return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
}).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const clean = (s, max = 350) => decode(s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1'))
  .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

// Restricted feed XML reader, not a general XML interpreter. Reject DTD/entities and
// malformed nesting instead of attempting recovery or entity expansion.
export function parseFeed(xml, source, date) {
  if (Buffer.byteLength(xml) > MAX_BYTES || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('unsafe or oversized feed');
  const stripped = xml.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/<\?[\s\S]*?\?>/g, '');
  const stack = [];
  for (const m of stripped.matchAll(/<([^>]+)>/g)) {
    const tag = m[1];
    if (tag.startsWith('!')) throw new Error('unsupported XML declaration');
    if (/\/$/.test(tag)) continue;
    if (tag.startsWith('/')) { if (stack.pop() !== tag.slice(1).trim()) throw new Error('malformed feed nesting'); }
    else stack.push(tag.split(/\s/)[0]);
  }
  if (stack.length || !/<(?:rss|feed)\b/i.test(xml)) throw new Error('not a complete RSS/Atom feed');
  const entries = [...xml.matchAll(/<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi)].slice(0, 100);
  const get = (s, name) => s.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i'))?.[1] || '';
  const result = [], seen = new Set();
  for (const [, , body] of entries) {
    const linkTags = [...body.matchAll(/<link\b([^>]*)\/?\s*>/gi)];
    const attrs = linkTags.map((m) => Object.fromEntries([...m[1].matchAll(/([\w:]+)\s*=\s*["']([^"']*)["']/g)].map((a) => [a[1], a[2]])));
    const link = safeUrl(decode(get(body, 'link').trim() || attrs.find((a) => a.href && (!a.rel || a.rel === 'alternate'))?.href || ''));
    const title = clean(get(body, 'title'), 180);
    const published = Date.parse(clean(get(body, 'pubDate') || get(body, 'published') || get(body, 'updated')));
    const age = (Date.parse(date) - published) / 86400000;
    if (!link || !title || !Number.isFinite(published) || age < -1 || age > 60 || seen.has(link)) continue;
    seen.add(link);
    result.push({ id: hash(link).slice(0, 24), title, url: link, source: source.name,
      sourceId: source.id, published: new Date(published).toISOString(), summary: clean(get(body, 'description') || get(body, 'summary')) });
    if (result.length === MAX_ITEMS) break;
  }
  return result;
}

async function fetchFeed(source, fetcher) {
  const res = await fetcher(source.url, { headers: { 'User-Agent': 'DailyTeam/1.0 feed-reader', Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' }, signal: AbortSignal.timeout(8000), redirect: 'error' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const type = res.headers.get('content-type') || '';
  if (!/xml|rss|atom/i.test(type)) throw new Error('unexpected feed content type');
  if (Number(res.headers.get('content-length')) > MAX_BYTES) throw new Error('oversized feed');
  const reader = res.body.getReader(); let bytes = 0, chunks = [];
  try { while (true) { const { done, value } = await reader.read(); if (done) break;
    bytes += value.length; if (bytes > MAX_BYTES) throw new Error('oversized feed'); chunks.push(value);
  } } finally { await reader.cancel().catch(() => {}); }
  return Buffer.concat(chunks).toString('utf8');
}

export async function discover({ date, cacheFile, recent = [], fetcher = fetch, sources = FEED_SOURCES, offline = false }) {
  let cache = { items: [], fetched: {} };
  try { cache = JSON.parse(readFileSync(cacheFile, 'utf8')); if (!Array.isArray(cache.items) || !cache.fetched || typeof cache.fetched !== 'object') throw new Error('invalid cache'); }
  catch { cache = { items: [], fetched: {} }; }
  const items = [...cache.items], status = [];
  for (const source of sources) {
    if (!source.enabled) { status.push({ source: source.id, status: 'disabled', reason: source.reason }); continue; }
    const age = Date.parse(date) - Date.parse(cache.fetched[source.id]);
    if (offline || (age >= 0 && age < 86400000)) { status.push({ source: source.id, status: offline ? 'offline' : 'cached' }); continue; }
    try {
      const found = parseFeed(await fetchFeed(source, fetcher), source, date);
      items.push(...found); cache.fetched[source.id] = date;
      status.push({ source: source.id, status: 'fetched', count: found.length });
    } catch (e) { status.push({ source: source.id, status: 'failed', reason: e.message.slice(0, 150) }); }
  }
  const seen = new Set();
  cache.items = items.filter((i) => {
    if (!textItem(i)) return false;
    const age = (Date.parse(date) - Date.parse(i.published)) / 86400000;
    if (age < -1 || age > 60 || seen.has(i.id)) return false; seen.add(i.id); return true;
  }).sort((a, b) => b.published.localeCompare(a.published)).slice(0, 100);
  if (!offline) {
    try { mkdirSync(dirname(cacheFile), { recursive: true }); const temp = `${cacheFile}.${process.pid}.tmp`;
      writeFileSync(temp, `${JSON.stringify(cache, null, 2)}\n`); renameSync(temp, cacheFile);
    } catch (e) { status.push({ source: 'cache', status: 'write-failed', reason: e.message.slice(0, 150) }); }
  }
  const used = new Set(recent.flatMap((d) => d.usedSources));
  const available = cache.items.filter((i) => !used.has(i.id));
  const groups = [...new Set(available.map((i) => i.sourceId))].map((id) => available.filter((i) => i.sourceId === id));
  const balanced = [];
  for (let n = 0; n < MAX_ITEMS && balanced.length < MAX_ITEMS; n++) for (const group of groups) {
    if (group[n] && balanced.length < MAX_ITEMS) balanced.push(group[n]);
  }
  return { items: balanced, status };
}
function textItem(i) { return i && typeof i.id === 'string' && typeof i.title === 'string' && i.title.length <= 180
  && typeof i.summary === 'string' && i.summary.length <= 350 && typeof i.source === 'string' && safeUrl(i.url) && Number.isFinite(Date.parse(i.published)); }

export function planningInput({ date, task, request, discovery, recent, inventory = null }) {
  const candidates = [ ...(request ? [{ id: `request-${request.repository}-${request.number}`, kind: 'request', task: request.task, url: request.url }] : []),
    ...discovery.items.filter((i) => /\b(ui|ux|interface|design|accessib\w*|css|web|browser|editor|tool\w*|chart\w*|visual\w*|component\w*|navigation|input|animation|workflow|prototype|keyboard|search|dashboard)\b/i.test(`${i.title} ${i.summary}`))
      .slice(0, 5).map((i) => ({ ...i, kind: 'feed' })),
    ...(inventory?.gaps || []).slice(0, 2).map((g) => ({ id: `gap-${g.category.toLowerCase()}`, kind: 'gap', ...g })) ];
  candidates.push({ id: 'daily-task', kind: 'task', task });
  const savedRequest = request ? Object.fromEntries(['repository', 'number', 'url', 'title', 'task', 'votes'].filter((k) => request[k] !== undefined).map((k) => [k, request[k]])) : null;
  return { schemaVersion: 1, date, task, request: savedRequest, sources: discovery.status,
    candidates, recent, inventory: inventory ? { sourceHash: inventory.sourceHash, gaps: inventory.gaps } : null };
}

export function readSnapshot(file, date) {
  const input = JSON.parse(readFileSync(file, 'utf8'));
  if (input.schemaVersion !== 1 || input.date !== date || typeof input.task !== 'string' || !Array.isArray(input.candidates)
    || !input.candidates.some((c) => c.id === 'daily-task') || !Array.isArray(input.recent) || !Array.isArray(input.sources)) throw new Error('invalid planning snapshot or date mismatch');
  return input;
}
