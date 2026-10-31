import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseTrending, discover } from './feed-planning.mjs';
import { PROJECT_SOURCES, projectInput, projectProblems, assertProjectExport } from './project-planning.mjs';
import { hash, recentPacks } from './component-pack.mjs';
import { buildSite, dayReadme } from './publish.mjs';
import { buildPrompt } from './recruit.mjs';

const date = '2026-10-31';
const feeds = ['github-trending', 'hacker-news', 'reddit-sideproject'].map((sourceId, n) => ({
  id: `signal-${n}`, sourceId, source: sourceId, title: `Useful signal ${n}`, summary: 'A concrete need',
  url: `https://example.test/${n}`, published: '2026-10-30T12:00:00Z',
}));
const input = () => projectInput({ date, discovery: { items: feeds, status: [{ source: 'reddit-beautiful', status: 'failed', reason: 'HTTP 429' }] }, recent: [] });
const project = () => ({ schemaVersion: 1, name: 'Queue garden', audience: 'Workshop hosts',
  problem: 'Show how uneven arrivals create waiting', interaction: 'Move arrival times across a timeline',
  outcome: 'See queue length change', recovery: 'Reset sample', mechanism: 'Direct scheduling linked to animated waiting lanes',
  difference: 'A manipulable time model instead of a static queue chart', whyNow: 'Saved signals suggest local simulation tools',
  sourceIds: ['signal-0', 'signal-1'], evidenceStatus: 'sourced',
  alternatives: [1, 2, 3].map(n => ({ name: `Direction ${n}`, need: `Need ${n}`, mechanism: `Mechanism ${n}`, rejection: n === 1 ? 'Chosen for direct action' : 'Less useful' })) });
const plan = p => `## Pitch\n**Member 1: Queue**\nShape time.\n**Member 2: Lanes**\nReveal waits.\n**Member 3: Pulse**\nShow arrival.\n**Member 4: Reset**\nAllow recovery.\n\n## Clash\n${['Member 1', 'Member 2', 'Member 3', 'Member 4', 'Member 1', 'Member 2'].map(r => `**${r}:** Show changing waits.`).join('\n')}\n\n## Decision\nWorkshop hosts move arrivals and see waiting lanes change.\nConcept: Queue garden\n\n## Build notes\nConnect time. Show waits. Reset sample.\n\n\`\`\`json\n${JSON.stringify(p)}\n\`\`\``;
const html = '<!doctype html><html lang="en"><head><title>Queue garden</title><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><label>Arrival<input type="range" min="0" max="10"></label><output>Sample queue</output><script>document.querySelector("input").oninput=e=>document.querySelector("output").textContent=e.target.value;</script></body></html>';

test('Trending cards normalize repository links and mark observed time; markup drift fails', () => {
  const source = PROJECT_SOURCES[0];
  const card = '<article class="Box-row"><h2><a href="/owner/project">owner / project</a></h2><p>Useful &amp; local</p></article>';
  const items = parseTrending(card + card, source, date);
  assert.equal(items.length, 1); assert.equal(items[0].url, 'https://github.com/owner/project');
  assert.equal(items[0].summary, 'Useful & local'); assert.equal(items[0].observed, true);
  assert.throws(() => parseTrending('<html>Changed</html>', source, date), /markup/);
});

test('project evidence requires saved IDs and source diversity; fallback and custom briefs stay honest', () => {
  assert.deepEqual(projectProblems(project(), input()), []);
  for (const [change, expected] of [
    [p => p.sourceIds = ['invented'], /saved feed/],
    [p => p.sourceIds = ['signal-0'], /two available/],
    [p => p.alternatives = [], /three concrete/],
    [p => p.mechanism = '', /mechanism/],
    [p => p.evidenceStatus = 'original-fallback', /actual sources/],
    [p => p.alternatives[1].mechanism = p.alternatives[0].mechanism, /distinct names and mechanisms/],
  ]) { const p = project(); change(p); assert.match(projectProblems(p, input()).join(';'), expected); }
  const empty = projectInput({ date, discovery: { items: [], status: [] }, recent: [] });
  const fallback = { ...project(), sourceIds: [], evidenceStatus: 'original-fallback' };
  assert.deepEqual(projectProblems(fallback, empty), []);
  const custom = projectInput({ date, brief: 'Chosen brief', discovery: { items: [], status: [] }, recent: [] });
  assert.deepEqual(projectProblems(fallback, custom), []); assert.equal(custom.task, 'Chosen brief');
  const stale = { ...feeds[0], published: '2026-10-01T00:00:00Z' };
  assert.equal(projectInput({ date, discovery: { items: [stale], status: [] }, recent: [] }).candidates.length, 1);
  assert.match(projectProblems(project(), { ...input(), recent: [{ date: '2026-10-30', project: project() }] }).join(';'), /repeats/);
  const reddit = projectInput({ date, discovery: { items: [feeds[2], { ...feeds[2], id: 'other-reddit', sourceId: 'reddit-beautiful' }], status: [] }, recent: [] });
  assert.deepEqual(projectProblems({ ...project(), sourceIds: ['signal-2'] }, reddit), []);
});

test('future recruitment broadens crafts and project needs while retaining historical component prompt', () => {
  const base = { roles: [], methods: [], constraints: [], tasks: [], guests: [], temperaments: [] };
  const future = buildPrompt(base, [], [], '2026-11-02')[1].content;
  assert.match(future, /project rules replace the component-only/);
  assert.doesNotMatch(future, /<component_inspiration/);
  assert.match(buildPrompt(base, [], [], '2026-10-26')[1].content, /<component_inspiration/);
});

test('live discovery path parses Trending and Atom, records rate limits and retains offline backlog', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'project-feeds-'));
  try {
    const sources = PROJECT_SOURCES.filter(s => ['github-trending', 'reddit-sideproject', 'reddit-beautiful'].includes(s.id));
    const fetcher = async (url, options) => url.includes('trending')
      ? (assert.equal(options.headers.Accept, 'text/html'), new Response('<article class="Box-row"><h2><a href="/a/b">a/b</a></h2><p>Project</p></article>', { headers: { 'content-type': 'text/html' } }))
      : url.includes('SideProject') ? new Response('<feed><entry><title>Local tool</title><link href="https://example.test/post"/><updated>2026-10-30T00:00:00Z</updated></entry></feed>', { headers: { 'content-type': 'application/atom+xml' } })
        : new Response('Limited', { status: 429 });
    const opts = { date, cacheFile: join(dir, 'cache.json'), sources, fetcher };
    const result = await discover(opts);
    assert.equal(result.items.length, 2); assert.equal(result.status[2].reason, 'HTTP 429');
    const cached = await discover({ ...opts, offline: true, fetcher: () => { throw new Error('offline must not fetch'); } });
    assert.equal(cached.items.length, 2);
    const refreshed = await discover({ ...opts, date: '2026-11-01' });
    assert.equal(refreshed.items.find(i => i.sourceId === 'github-trending').published, '2026-11-01T00:00:00.000Z');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

async function run(replies, args, inspect) {
  const dir = mkdtempSync(join(tmpdir(), 'daily-project-')), calls = [];
  const server = createServer((req, res) => {
    let body = ''; req.on('data', c => body += c); req.on('end', () => {
      calls.push(JSON.parse(body)); const text = replies.shift();
      res.writeHead(text === undefined ? 500 : 200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ model: 'fixture', choices: [{ message: { content: text || '' } }] }));
    });
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  try {
    const snapshot = join(dir, 'input.json'); writeFileSync(snapshot, JSON.stringify(input()));
    const days = join(dir, 'days');
    const child = spawn(process.execPath, [resolve('run.mjs'), '--date', date, '--snapshot', snapshot, '--out', days, ...args], {
      env: { ...process.env, PROVIDER: 'openrouter', MODEL: 'fixture', OPENROUTER_API_KEY: 'fixture', API_URL: `http://127.0.0.1:${server.address().port}`, ARTIFACTS: '', COMPONENT_REQUESTS_FILE: '/must-not-read', COMPONENT_SOURCES_FILE: '', COMPONENTS_DIR: '', RETRY_MS: '0' },
    });
    let output = ''; child.stdout.on('data', c => output += c); child.stderr.on('data', c => output += c);
    const code = await new Promise(r => child.on('close', r));
    const record = join(days, date, 'day.json');
    await inspect({ dir, days, calls, output, code, day: existsSync(record) ? JSON.parse(readFileSync(record, 'utf8')) : null });
  } finally { server.close(); rmSync(dir, { recursive: true, force: true }); }
}

test('actual default CLI builds one project, preserves citations, exports evidence and blocks tampering', async () => {
  await run([plan(project()), html], [], ({ days, dir, calls, output, code, day }) => {
    assert.equal(code, 0, output); assert.equal(calls.length, 2); assert.equal(day.component, false);
    assert.equal(day.projectMode, true); assert.equal(day.status, 'ok', output); assert.equal(day.artifacts.length, 1);
    assert.equal(day.planning.inputHash, hash(input())); assert.equal(day.pack, undefined);
    assert.match(calls[1].messages[1].content, /https:\/\/example.test\/0/);
    assert.deepEqual(day.planning.selectedSourceIds, project().sourceIds);
    const target = join(days, date); assertProjectExport(day, target);
    assert.match(dayReadme(day, days, ''), /Used feed inspiration/);
    const site = join(dir, 'site'); buildSite(site, [day], days, 'isas1/daily-team');
    assert.ok(existsSync(join(site, date, 'planning-input.json'))); assert.ok(existsSync(join(site, date, 'artifact-1.html')));
    assert.deepEqual(recentPacks(days, '2026-11-01')[0].project, project());
    writeFileSync(join(target, 'artifact-1.html'), 'changed');
    assert.throws(() => assertProjectExport(day, target), /hash mismatch/);
  });
});

test('invalid evidence stops before build; planning-only and snapshot mode guard work', async () => {
  const invalid = { ...project(), sourceIds: ['invented'] };
  await run([plan(invalid), plan(invalid)], [], ({ calls, code, day }) => {
    assert.equal(code, 1); assert.equal(calls.length, 2); assert.equal(day.status, 'failed'); assert.equal(day.artifacts.length, 0);
  });
  await run([plan(project())], ['--artifacts', '0'], ({ calls, code, day, output }) => {
    assert.equal(code, 0, output); assert.equal(calls.length, 1); assert.equal(day.artifacts.length, 0);
  });
  await run([plan({ ...project(), sourceIds: [], evidenceStatus: 'original-fallback' }), html], ['--brief', 'Make a chosen local tool'], ({ calls, code, day, output }) => {
    assert.equal(code, 0, output); assert.equal(calls.length, 2); assert.equal(day.task, 'Make a chosen local tool');
    assert.deepEqual(day.planning.selectedSourceIds, []);
  });
  await run([], ['--pack'], ({ calls, code, output }) => {
    assert.equal(code, 2); assert.equal(calls.length, 0); assert.match(output, /snapshot mode/);
  });
  await run([], ['--artifacts', '6'], ({ calls, code, output }) => {
    assert.equal(code, 2); assert.equal(calls.length, 0); assert.match(output, /one finished project/);
  });
});
