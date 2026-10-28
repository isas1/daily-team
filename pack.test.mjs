import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { samplePack, samplePlan, sampleHtml } from './test-fixtures/pack.mjs';
import { packProblems, packInputProblems, parsePack, repetitionWarnings, assertPackExport, applyTokens, hash } from './component-pack.mjs';
import { parseFeed, discover, planningInput, readSnapshot, FEED_SOURCES } from './feed-planning.mjs';
import { checkArtifact } from './run.mjs';
import { buildSite } from './publish.mjs';
import { buildComparison, comparisonRows } from './compare.mjs';
import { auditInventory } from './inventory-audit.mjs';
import { libraryOutcomes, recordLibraryOutcome } from './pack-review.mjs';

const date = '2026-10-27', source = { id: 'test', name: 'Test', url: 'https://example.test/feed', enabled: true };
const temp = () => mkdtempSync(join(tmpdir(), 'daily-pack-'));
const item = (url = 'https://example.test/post', title = 'Accessible web inputs') => `<item><title>${title}</title><link>${url}</link><pubDate>Mon, 26 Oct 2026 12:00:00 GMT</pubDate><description><![CDATA[<p>Useful controls</p><script>bad()</script>]]></description></item>`;
const rss = (body = item()) => `<?xml version="1.0"?><rss version="2.0"><channel>${body}</channel></rss>`;
const response = (body = rss()) => new Response(body, { headers: { 'content-type': 'application/rss+xml' } });

test('pack contract rejects unknown categories, overlapping jobs, unsafe paths and token injection', () => {
  assert.deepEqual(packProblems(samplePack(), 6), []);
  assert.equal(parsePack(samplePlan()).components.length, 6);
  for (const [mutate, message] of [
    [p => p.components[0].category = 'Release theme', /unknown category/],
    [p => p.components[1].purpose = p.components[0].purpose, /overlapping purpose/],
    [p => p.components[1].mechanism = p.components[0].mechanism, /overlapping mechanism/],
    [p => p.components[1].purpose = 'Name the release for a component', /overlapping purpose/],
    [p => p.components[0].file = '../stolen.html', /invalid file/],
    [p => p.tokens.motion.easing = 'ease;}</style><script>bad()</script>', /invalid token/],
    [p => p.tokens.colors.dark.extra = '</style>', /unknown dark/],
    [p => p.tokens.typography.extra = '</style>', /unknown typography/],
    [p => p.components[0].sources[0].url = 'javascript:bad()', /source attribution/],
    [p => p.demo.rows = [1], /demo must connect/],
    [p => p.components[0].recovery = '', /missing recovery/],
  ]) { const p = samplePack(); mutate(p); assert.match(packProblems(p).join('; '), message); }
  assert.match(packProblems(samplePack(), 3).join('; '), /count/);
  assert.throws(() => parsePack('no contract'), /exactly one/);
  assert.throws(() => parsePack('```json\n{}\n```\n```json\n{}\n```'), /exactly one/);
  assert.ok(repetitionWarnings(samplePack(), [{ date: '2026-10-26', components: samplePack().components }]).length >= 6);
  assert.ok(packProblems({ ...samplePack(), components: [null] }).length > 0);
  assert.ok(packProblems({ ...samplePack(), opportunities: {} }).length > 0);
  assert.deepEqual(packInputProblems(samplePack(), { candidates: [{ id: 'daily-task' }] }, true), []);
  const other = samplePack(); other.selection.id = 'gap-media';
  assert.match(packInputProblems(other, { candidates: [{ id: 'daily-task' }] }, true).join(';'), /custom brief/);
});

test('restricted RSS/Atom reader rejects malformed/hostile XML and deduplicates canonical links', () => {
  const items = parseFeed(rss(item('https://example.test/post?utm_source=x') + item()), source, date);
  assert.equal(items.length, 1); assert.equal(items[0].summary, 'Useful controls'); assert.equal(items[0].url, 'https://example.test/post');
  const atom = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Keyboard tool</title><link rel="self" href="https://example.test/ignored"/><link rel="alternate" href="https://example.test/atom"/><updated>2026-10-26T12:00:00Z</updated><summary>Type &amp; edit</summary></entry></feed>`;
  assert.equal(parseFeed(atom, source, date)[0].url, 'https://example.test/atom');
  assert.throws(() => parseFeed('<rss><channel></rss>', source, date), /malformed/);
  assert.throws(() => parseFeed('<!DOCTYPE rss [<!ENTITY x "xx">]><rss/>', source, date), /unsafe/);
  assert.throws(() => parseFeed('x'.repeat(2097153), source, date), /oversized/);
  assert.deepEqual(parseFeed(rss(item('javascript:bad()')), source, date), []);
  assert.deepEqual(parseFeed(rss(item().replace('2026', '2020')), source, date), []);
  assert.equal(parseFeed(rss(Array.from({ length: 30 }, (_, i) => item(`https://example.test/${i}`)).join('')), source, date).length, 20);
});

test('feed discovery caches, handles failures and excludes used sources; irrelevant HN news stays out', async () => {
  const dir = temp(), cacheFile = join(dir, 'backlog.json'); let calls = 0;
  try {
    const opts = { date, cacheFile, sources: [source], fetcher: async () => { calls++; return response(); } };
    const first = await discover(opts); assert.equal(calls, 1); assert.equal(first.items.length, 1);
    const cached = await discover(opts); assert.equal(calls, 1); assert.equal(cached.status[0].status, 'cached');
    const fallback = await discover({ ...opts, date: '2026-10-28', fetcher: async () => { throw new Error('timeout'); } });
    assert.equal(fallback.status[0].status, 'failed'); assert.equal(fallback.items.length, 1);
    assert.equal((await discover({ ...opts, recent: [{ usedSources: [first.items[0].id] }] })).items.length, 0);
    const input = planningInput({ date, task: 'A useful task', request: null, recent: [], discovery: { status: [],
      items: [{ ...first.items[0], title: 'Election results', summary: 'New political leader' }, first.items[0]] } });
    assert.equal(input.candidates.filter(c => c.kind === 'feed').length, 1);
    assert.ok(FEED_SOURCES.find(s => s.id === 'hacker-news' && s.enabled));
    assert.ok(!FEED_SOURCES.find(s => s.id === 'codrops').enabled);
    writeFileSync(join(dir, 'snapshot.json'), JSON.stringify(input));
    assert.deepEqual(readSnapshot(join(dir, 'snapshot.json'), date), input);
    assert.throws(() => readSnapshot(join(dir, 'snapshot.json'), '2026-10-28'), /date mismatch/);
    writeFileSync(cacheFile, '{broken');
    assert.equal((await discover({ ...opts, fetcher: async () => { throw new Error('offline'); } })).items.length, 0);
    writeFileSync(cacheFile, JSON.stringify({ items: [null, {}, { title: 'broken' }], fetched: {} }));
    assert.equal((await discover({ ...opts, offline: true })).items.length, 0);
    const requestInput = planningInput({ date, task: 'Task', request: { repository: 'a/b', number: 1, url: 'https://github.com/a/b/issues/1', task: 'Task', body: 'private issue body' },
      recent: [], discovery: { items: [], status: [] } });
    assert.equal(requestInput.request.body, undefined);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('response byte bounds, wrong content types and empty feeds preserve fallback', async () => {
  const dir = temp();
  try {
    for (const res of [new Response('<html>wrong</html>', { headers: { 'content-type': 'text/html' } }),
      new Response('x'.repeat(2097153), { headers: { 'content-type': 'text/xml' } }), new Response('', { status: 503 })]) {
      const result = await discover({ date, cacheFile: join(dir, 'cache'), sources: [source], fetcher: async () => res });
      assert.equal(result.status[0].status, 'failed'); assert.deepEqual(result.items, []);
    }
    const empty = await discover({ date, cacheFile: join(dir, 'cache'), sources: [source], fetcher: async () => response(rss('')) });
    assert.deepEqual(empty.items, []);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

async function cli(replies, args = [], inspect = () => {}) {
  const dir = temp(), calls = [];
  const server = createServer((req, res) => {
    let body = ''; req.on('data', c => body += c); req.on('end', () => {
      calls.push(JSON.parse(body)); const answer = replies.shift();
      res.writeHead(answer === undefined ? 500 : 200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ model: 'fixture-model', choices: [{ message: { content: answer || '' } }] }));
    });
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  try {
    const child = spawn(process.execPath, [resolve('run.mjs'), '--date', date, '--out', join(dir, 'days'), '--offline', ...args],
      { env: { ...process.env, PROVIDER: 'openrouter', MODEL: 'fixture-model', OPENROUTER_API_KEY: 'sk-or-fixture',
        API_URL: `http://127.0.0.1:${server.address().port}`, ARTIFACTS: '', COMPONENT_REQUESTS_FILE: '', RETRY_MS: '0' } });
    let output = ''; child.stdout.on('data', c => output += c); child.stderr.on('data', c => output += c);
    const code = await new Promise(r => child.on('close', r));
    await inspect({ dir, calls, code, output, day: JSON.parse(readFileSync(join(dir, 'days', date, 'day.json'), 'utf8')) });
  } finally { server.close(); rmSync(dir, { recursive: true, force: true }); }
}

test('actual CLI builds distinct default pack, assembled project, hashes, snapshots and export', async () => {
  const replies = [samplePlan(), ...Array.from({ length: 6 }, (_, i) => sampleHtml(i + 1)), sampleHtml()];
  await cli(replies, [], async ({ dir, calls, code, output, day }) => {
    assert.equal(code, 0, output); assert.equal(calls.length, 8); assert.equal(day.artifacts.length, 7);
    assert.equal(day.status, 'ok', output); assert.equal(day.pack.components.length, 6);
    const target = join(dir, 'days', date); assertPackExport(day, target);
    const manifest = JSON.parse(readFileSync(join(target, 'pack.json')));
    assert.equal(manifest.reviewStatus, 'needs-review'); assert.ok(manifest.components.every(c => c.libraryAcceptance === 'unreviewed'));
    assert.match(readFileSync(join(target, 'piece.html'), 'utf8'), /data-pack-tokens/);
    assert.equal(comparisonRows(day)[1].name, 'Package card');
    const comparison = await buildComparison(target, {
      models: [{ key: 'opus', label: 'Opus', model: 'fixture-model' }, { key: 'sonnet', label: 'Sonnet', model: 'fixture-sonnet' }],
      complete: async (messages, _, model) => ({ model, text: sampleHtml(Number(messages[1].content.match(/Build standalone component (\d+)/)[1])) }),
    });
    assert.equal(comparison.status, 'ok');
    assert.match(readFileSync(join(target, 'compare-sonnet-1.html'), 'utf8'), /data-pack-tokens/);
    const site = join(dir, 'site'); buildSite(site, [day], join(dir, 'days'), 'isas1/daily-team');
    assert.ok(existsSync(join(site, date, 'pack.json'))); assert.ok(existsSync(join(site, date, 'artifact-1.html')));
    assert.deepEqual(libraryOutcomes(join(dir, 'days')), { generated: 6, accepted: 0, rejected: 0, unreviewed: 6, stale: 0 });
    recordLibraryOutcome(target, day.pack.components[0].id, 'accepted', 'https://example.test/library-entry', 'Disposable test evidence');
    assert.equal(libraryOutcomes(join(dir, 'days')).accepted, 1);
    writeFileSync(join(target, 'artifact-1.html'), 'tampered');
    assert.throws(() => assertPackExport(day, target), /hash mismatch/);
    assert.equal(libraryOutcomes(join(dir, 'days')).stale, 1);
  });
});

test('smaller packs assemble; invalid plan stops before build; planning-only saves manifest', async () => {
  await cli([samplePlan(2), sampleHtml(1, 2), sampleHtml(2, 2), sampleHtml(0, 2)], ['--artifacts', '2'], ({ code, output, calls, day }) => {
    assert.equal(code, 0, output); assert.equal(calls.length, 4); assert.equal(day.artifacts[0].kind, 'piece');
  });
  await cli(['no json', 'still no json'], [], ({ code, calls, day }) => {
    assert.equal(code, 1); assert.equal(calls.length, 2); assert.equal(day.status, 'failed'); assert.equal(day.artifacts.length, 0);
  });
  await cli([samplePlan()], ['--artifacts', '0'], ({ dir, code, output, calls, day }) => {
    assert.equal(code, 0, output); assert.equal(calls.length, 1); assert.equal(day.artifacts.length, 0);
    assertPackExport(day, join(dir, 'days', date));
  });
});

test('custom pack brief bypasses feeds; explicit replay uses saved candidate input', async () => {
  await cli([samplePlan(1), sampleHtml(1, 1), sampleHtml(0, 1)], ['--pack', '--brief', 'Custom release flow', '--artifacts', '1'], ({ calls, code, output, dir }) => {
    assert.equal(code, 0, output); assert.match(calls[0].messages[1].content, /Custom release flow/);
    const input = readSnapshot(join(dir, 'days', date, 'planning-input.json'), date);
    assert.equal(input.sources[0].status, 'custom-brief');
  });
  const dir = temp();
  try {
    const input = planningInput({ date, task: 'Saved replay task', request: null, recent: [], discovery: { items: [], status: [] } });
    const file = join(dir, 'snapshot.json'); writeFileSync(file, JSON.stringify(input));
    await cli([samplePlan()], ['--artifacts', '0', '--snapshot', file, '--requests', '/not-used/missing.json'], ({ day, code, output }) => {
      assert.equal(code, 0, output); assert.equal(day.task, 'Saved replay task'); assert.equal(day.planning.inputHash, hash(input));
    });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('sample tiles pass existing offline craft checks; historical records need no pack files', () => {
  for (let row = 1; row <= 6; row++) assert.deepEqual(checkArtifact(sampleHtml(row), 'component'), [], `row ${row}`);
  assert.deepEqual(checkArtifact(sampleHtml(), 'piece'), []);
  assert.match(applyTokens(sampleHtml(1), samplePack().tokens), /--pack-bg:#101215/);
  assert.doesNotThrow(() => assertPackExport({ date: '2026-10-21' }, '/nonexistent'));
});

test('inventory audit proposes mappings without changing source data', () => {
  const dir = temp();
  try {
    const cat = { totals: { tiles: 2 }, tileThemes: [{ slug: 'buttons', items: [{}] }, { slug: 'art', items: [{}] }] };
    writeFileSync(join(dir, 'catalog.json'), JSON.stringify(cat));
    writeFileSync(join(dir, 'taxonomy.json'), JSON.stringify({ seedThemeMap: { buttons: { role: 'button' }, art: { role: 'decoration' } } }));
    const audit = auditInventory(dir); assert.equal(audit.counts.Actions, 1); assert.equal(audit.mapping[1].proposedCategory, null);
    assert.equal(readFileSync(join(dir, 'catalog.json'), 'utf8'), JSON.stringify(cat));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
