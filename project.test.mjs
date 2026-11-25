import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseTrending, discover } from './feed-planning.mjs';
import { PROJECT_SOURCES, projectSource, projectInput, projectProblems, assertProjectExport, reviewedProblems, SOLUTION_FEEDS, SOLUTIONS_FROM } from './project-planning.mjs';
import { hash, recentPacks } from './component-pack.mjs';
import { buildSite, dayReadme } from './publish.mjs';
import { buildPrompt } from './recruit.mjs';
import { addCsp, projectScriptProblem } from './artifact-policy.mjs';
import { checkSolution, openSolutionBrowser } from './solution-check.mjs';

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
  craft: { rule: 'The arranger uses a canon: each arrival repeats a five-minute service block, starting after the prior block ends.',
    design: 'Line up time and waiting lanes in one score. On phones put the arrival slider above its lane. Amber marks waits.',
    trial: { start: 'Open with arrivals at minutes 0 and 5.', action: 'Move the second arrival to minute 2.',
      result: 'Show three minutes of waiting.', mistake: 'Put both arrivals at minute 0.', recovery: 'Reset the second arrival to minute 5 and show zero wait.' } },
  alternatives: [
    { name: 'Queue garden', need: 'Teach why queues form', mechanism: 'Repeat service blocks', action: 'Move an arrival', result: 'See wait time', rejection: 'Chosen for direct action' },
    { name: 'Room map', need: 'Reduce walking between stations', mechanism: 'Trace paths', action: 'Join two stations', result: 'Get walking distance', rejection: 'Needs a surveyed floor plan' },
    { name: 'Shift tally', need: 'Check shift coverage', mechanism: 'Accumulate staff minutes', action: 'Assign a shift', result: 'Find unstaffed times', rejection: 'Hides the effect of uneven arrivals' },
  ] });
const plan = p => `## Pitch\n**Member 1: Queue**\nShape time.\n**Member 2: Lanes**\nReveal waits.\n**Member 3: Pulse**\nShow arrival.\n**Member 4: Reset**\nAllow recovery.\n\n## Clash\n${['Member 1', 'Member 2', 'Member 3', 'Member 4', 'Member 1', 'Member 2'].map(r => `**${r}:** Show changing waits.`).join('\n')}\n\n## Decision\nWorkshop hosts move arrivals and see waiting lanes change.\nConcept: Queue garden\n\n## Build notes\nConnect time. Show waits. Reset sample.\n\n\`\`\`json\n${JSON.stringify(p)}\n\`\`\``;
const pageMarkup = `<!doctype html><html lang="en"><head><title>Queue garden</title><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body><label>Second arrival<input type="range" min="0" max="10" value="5"></label><output>0 minutes waiting</output><button>Reset</button>`;
const html = `${pageMarkup}
<script>
const input = document.querySelector('input');
const output = document.querySelector('output');
function showWait() { output.textContent = Math.max(0, 5 - Number(input.value)) + ' minutes waiting'; }
input.addEventListener('input', showWait);
document.querySelector('button').addEventListener('click', () => { input.value = 5; showWait(); });
</script></body></html>`;

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
    [p => p.alternatives[1].action = 'Move an arrival!', /distinct actions/],
    [p => p.alternatives[1].result = 'See wait time.', /distinct results/],
    [p => p.alternatives[1].result = '?', /concrete result/],
    [p => p.name = 'An unpitched idea', /match the chosen direction/],
    [p => delete p.craft.trial.recovery, /craft.trial.recovery/],
    [p => delete p.craft.rule, /craft.rule/],
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

test('project feed rotates daily and single-source policy requires one selected item', () => {
  const enabled = PROJECT_SOURCES.filter(s => s.enabled);
  const rotation = enabled.map((_, n) => projectSource(new Date(Date.parse('2026-11-05T00:00:00Z') + n * 86400000).toISOString().slice(0, 10)).id);
  assert.equal(new Set(rotation).size, enabled.length);
  assert.equal(projectSource('2026-11-05').id, rotation[0]);
  const source = PROJECT_SOURCES.find(s => s.id === 'github-trending');
  const selected = projectInput({ date, discovery: { items: [feeds[0]], status: [] }, recent: [], source });
  assert.equal(selected.feedPolicy, 'one-source-v1');
  assert.deepEqual(projectProblems({ ...project(), sourceIds: ['signal-0'] }, selected), []);
  assert.match(projectProblems({ ...project(), sourceIds: [] }, selected).join(';'), /exactly one item/);
  const wrong = { ...selected, selectedFeed: 'hacker-news' };
  assert.match(projectProblems({ ...project(), sourceIds: ['signal-0'] }, wrong).join(';'), /selected feed/);
  assert.deepEqual(projectProblems(project(), input()), [], 'old snapshots keep original source rules');
});

test('selected feed fetch and cache fallback exclude every other source', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'daily-one-feed-'));
  try {
    const cacheFile = join(dir, 'cache.json');
    writeFileSync(cacheFile, JSON.stringify({ items: [feeds[1]], fetched: {} }));
    const source = PROJECT_SOURCES.find(s => s.id === 'github-trending');
    const calls = [];
    const fetcher = async url => { calls.push(url); return new Response('<article class="Box-row"><h2><a href="/a/b">a/b</a></h2><p>Project</p></article>', { headers: { 'content-type': 'text/html' } }); };
    const result = await discover({ date, cacheFile, sources: [source], fetcher, restrictToSources: true });
    assert.deepEqual(calls, [source.url]);
    assert.deepEqual(result.items.map(i => i.sourceId), [source.id]);
    const offline = await discover({ date, cacheFile, sources: [source], offline: true, restrictToSources: true });
    assert.deepEqual(offline.items.map(i => i.sourceId), [source.id]);
    const failed = await discover({ date: '2026-11-01', cacheFile, sources: [source], fetcher: async () => { throw new Error('offline'); }, restrictToSources: true });
    assert.equal(failed.status[0].status, 'failed');
    assert.deepEqual(failed.items.map(i => i.sourceId), [source.id]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('project script gate parses classic JavaScript without executing it or counting HTML comments or data scripts', () => {
  assert.equal(projectScriptProblem(html), null);
  assert.equal(projectScriptProblem('<script type="application/javascript">throw new Error("do not run");</script>'), null);
  assert.equal(projectScriptProblem('<script type="module">export {};</script>'), null);
  assert.match(projectScriptProblem('<script>function broken( {</script>'), /syntax error/);
  assert.equal(projectScriptProblem('<SCRIPT>void 0</SCRIPT extra>'), null);
  assert.match(projectScriptProblem('<script-example>void 0</script>'), /needs inline JavaScript/);
  assert.match(projectScriptProblem('<!--<script>doThing()</script>--><script type="application/json">{}</script>'), /needs inline JavaScript/);
  assert.match(projectScriptProblem('<script src="elsewhere.js">doThing()</script>'), /needs inline JavaScript/);
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
    const response = (url, options) => url.includes('trending')
      ? (assert.equal(options.headers.Accept, 'text/html'), new Response('<article class="Box-row"><h2><a href="/a/b">a/b</a></h2><p>Project</p></article>', { headers: { 'content-type': 'text/html' } }))
      : url.includes('SideProject') ? new Response('<feed><entry><title>Local tool</title><link href="https://example.test/post"/><updated>2026-10-30T00:00:00Z</updated></entry></feed>', { headers: { 'content-type': 'application/atom+xml' } })
        : new Response('Limited', { status: 429 });
    const requests = [];
    const opts = { date, cacheFile: join(dir, 'cache.json'), sources, fetcher: response };
    const pending = discover({ ...opts, fetcher: (url, options) => new Promise((resolve) => {
      requests.push(() => resolve(response(url, options)));
    }) });
    assert.equal(requests.length, sources.length, 'start every fetch before the slowest feed responds');
    for (const respond of requests.reverse()) respond();
    const result = await pending;
    assert.deepEqual(result.status.map((receipt) => receipt.source), sources.map((source) => source.id));
    assert.equal(result.items.length, 2); assert.equal(result.status[2].reason, 'HTTP 429');
    const cached = await discover({ ...opts, offline: true, fetcher: () => { throw new Error('offline must not fetch'); } });
    assert.equal(cached.items.length, 2);
    const refreshed = await discover({ ...opts, date: '2026-11-01' });
    assert.equal(refreshed.items.find(i => i.sourceId === 'github-trending').published, '2026-11-01T00:00:00.000Z');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

function sendReply(res, text) {
  res.writeHead(text === undefined ? 500 : 200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ model: 'fixture', choices: [{ message: { content: text || '' } }] }));
}

async function run(replies, args, inspect, snapshotInput = input(), previousDay = null) {
  const dir = mkdtempSync(join(tmpdir(), 'daily-project-')), calls = [];
  const server = createServer((req, res) => {
    let body = ''; req.on('data', c => body += c); req.on('end', () => {
      calls.push(JSON.parse(body));
      const reply = typeof replies === 'function' ? replies(calls.at(-1), res) : replies.shift();
      if (reply === null) return; // Fixture will release this response when the other request arrives.
      sendReply(res, reply);
    });
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  try {
    const snapshot = join(dir, 'input.json'); writeFileSync(snapshot, JSON.stringify(snapshotInput));
    const days = join(dir, 'days');
    if (previousDay) {
      const out = join(days, snapshotInput.date);
      mkdirSync(out, { recursive: true });
      writeFileSync(join(out, 'day.json'), JSON.stringify(previousDay));
      writeFileSync(join(out, 'planning-input.json'), JSON.stringify(snapshotInput));
    }
    const source = previousDay ? [] : ['--snapshot', snapshot];
    const child = spawn(process.execPath, [resolve('run.mjs'), '--date', snapshotInput.date, '--out', days, ...source, ...args], {
      env: { ...process.env, PROVIDER: 'openrouter', MODEL: 'fixture', OPENROUTER_API_KEY: 'fixture', API_URL: `http://127.0.0.1:${server.address().port}`, ARTIFACTS: '', COMPONENT_REQUESTS_FILE: '/must-not-read', COMPONENT_SOURCES_FILE: '', COMPONENTS_DIR: '', RETRY_MS: '0' },
    });
    let output = ''; child.stdout.on('data', c => output += c); child.stderr.on('data', c => output += c);
    const code = await new Promise(r => child.on('close', r));
    const record = join(days, snapshotInput.date, 'day.json');
    await inspect({ dir, days, calls, output, code, day: existsSync(record) ? JSON.parse(readFileSync(record, 'utf8')) : null });
  } finally { server.close(); rmSync(dir, { recursive: true, force: true }); }
}

test('actual default CLI builds one project, preserves citations, exports evidence and blocks tampering', async () => {
  const snapshot = input();
  snapshot.recent = [{ date: '2026-10-30', project: { name: 'Paper fold', problem: 'Align two corners',
    mechanism: 'Reflect the crease', interaction: 'Fold one corner', craft: { design: 'Use an edge-on fold diagram' } } }];
  await run([plan(project()), html], [], ({ days, dir, calls, output, code, day }) => {
    assert.equal(code, 0, output); assert.equal(calls.length, 2); assert.equal(day.component, false);
    assert.equal(day.projectMode, true); assert.equal(day.status, 'ok', output); assert.equal(day.artifacts.length, 1);
    assert.equal(day.planning.inputHash, hash(snapshot)); assert.equal(day.pack, undefined);
    assert.match(calls[1].messages[1].content, /https:\/\/example.test\/0/);
    assert.match(calls[0].messages[1].content, /https:\/\/example.test\/2/);
    assert.match(calls[0].messages[1].content, /Use an edge-on fold diagram/);
    assert.doesNotMatch(calls[1].messages[1].content, /https:\/\/example.test\/2|Use an edge-on fold diagram|<planning_input|## Clash|"alternatives":/);
    assert.match(calls[1].messages[1].content, /## Build notes\nConnect time\. Show waits\. Reset sample\./);
    assert.match(calls[1].messages[1].content, /"trial":\{"start":"Open with arrivals at minutes 0 and 5\."/);
    assert.deepEqual(day.planning.selectedSourceIds, project().sourceIds);
    const target = join(days, date); assertProjectExport(day, target);
    assert.match(dayReadme(day, days, ''), /Used feed inspiration/);
    const site = join(dir, 'site'); buildSite(site, [day], days, 'isas1/daily-team');
    const page = readFileSync(join(site, date, 'index.html'), 'utf8');
    assert.ok(page.indexOf(day.decision) < page.indexOf('<iframe'));
    assert.ok(page.indexOf('<iframe') < page.indexOf('<h2>Past projects</h2>'));
    assert.ok(page.indexOf('<h2>Past projects</h2>') < page.indexOf('<details><summary>About this project</summary>'));
    assert.match(calls[1].messages[1].content, /at most 40 visible words across the entire initial project/);
    assert.ok(existsSync(join(site, date, 'planning-input.json'))); assert.ok(existsSync(join(site, date, 'artifact-1.html')));
    assert.deepEqual(recentPacks(days, '2026-11-01')[0].project, project());
    writeFileSync(join(target, 'artifact-1.html'), 'changed');
    assert.throws(() => assertProjectExport(day, target), /hash mismatch/);
    assert.throws(() => dayReadme(day, days, ''), /hash mismatch/);
    const rejectedSite = join(dir, 'rejected-site');
    assert.throws(() => buildSite(rejectedSite, [day], days, ''), /hash mismatch/);
    assert.equal(existsSync(rejectedSite), false);
  }, snapshot);
});

test('runner builds from exactly one saved feed item and rejects multiple items', async () => {
  const source = PROJECT_SOURCES.find(s => s.id === 'github-trending');
  const selected = projectInput({ date, discovery: { items: [feeds[0]], status: [] }, recent: [], source });
  const chosen = { ...project(), sourceIds: ['signal-0'] };
  await run([plan(chosen), html], [], ({ code, day, calls, output }) => {
    assert.equal(code, 0, output);
    assert.deepEqual(day.planning.selectedSourceIds, ['signal-0']);
    assert.match(calls[0].messages[1].content, /one-source-v1/);
    assert.match(calls[1].messages[1].content, /signal-0/);
  }, selected);
  await run([plan({ ...chosen, sourceIds: [] }), plan({ ...chosen, sourceIds: [] })], [], ({ code, day, calls }) => {
    assert.equal(code, 1); assert.equal(day.status, 'failed'); assert.equal(calls.length, 2);
  }, selected);
});

test('invalid evidence stops before build; planning-only and snapshot mode guard work', async () => {
  const invalid = { ...project(), sourceIds: ['invented'] };
  await run([plan(invalid), plan(invalid)], [], ({ calls, code, day }) => {
    assert.equal(code, 1); assert.equal(calls.length, 2); assert.equal(day.status, 'failed'); assert.equal(day.artifacts.length, 0);
  });
  const legacy = input(); delete legacy.craftVersion;
  const legacyProject = project(); delete legacyProject.craft;
  for (const direction of legacyProject.alternatives) { delete direction.action; delete direction.result; }
  await run([plan(legacyProject)], ['--artifacts', '0'], ({ calls, code, day, output, days }) => {
    assert.equal(code, 0, output); assert.equal(calls.length, 1); assert.equal(day.artifacts.length, 0);
    assertProjectExport(day, join(days, date));
  }, legacy);
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

test('actual CLI retries a cloned idea and a static artifact, then saves the usable result', async () => {
  const cloned = project(); cloned.alternatives[1].action = cloned.alternatives[0].action;
  const staticHtml = `${pageMarkup}</body></html>`;
  await run([plan(cloned), plan(project()), staticHtml, html], [], ({ calls, code, day, output }) => {
    assert.equal(code, 0, output); assert.equal(calls.length, 4); assert.equal(day.status, 'ok', output);
    assert.match(calls[1].messages.at(-1).content, /distinct actions/);
    assert.match(calls[3].messages.at(-1).content, /needs inline JavaScript/);
  });
});

test('actual CLI records a failed day without saving a project that still has a syntax error after retry', async () => {
  const broken = html.replace('function showWait()', 'function showWait(');
  await run([plan(project()), broken, broken], [], ({ calls, code, day, days }) => {
    assert.equal(code, 3); assert.equal(calls.length, 3); assert.equal(day.status, 'failed');
    assert.match(calls[2].messages.at(-1).content, /syntax error/);
    assert.match(day.error, /syntax error/);
    assert.equal(existsSync(join(days, date, 'artifact-1.html')), false);
    assertProjectExport(day, join(days, date));
  });
});


const solutionInput = () => projectInput({ date: SOLUTIONS_FROM, recent: [],
  discovery: { items: [], status: [] }, problemBriefs: reviewedProblems('problem-briefs.json', SOLUTIONS_FROM, []) });
const checkpoint = (phase, value, text) => ({ phase,
  steps: [{ action: 'fill', target: 'solution-measured', value }, { action: 'click', target: 'solution-calculate' }],
  expect: { target: 'solution-result', text } });
const solution = () => ({
  ...project(), name: 'Print scale', audience: 'Home sewing pattern users', problem: 'A pattern prints at the wrong size',
  interaction: 'Input the measured test line', outcome: 'Get the corrected print scale',
  recovery: 'Fix the entered length', mechanism: 'Divide the known length by the measured length',
  difference: 'One calculation replaces guessing the print scale', whyNow: 'The reviewed sewing brief reports an incorrect print size',
  sourceIds: [solutionInput().candidates[0].id],
  proof: { workaround: 'Measure and guess a new print scale', gap: 'Need the exact correction', improvement: 'Get the correction after a single measurement' },
  craft: { ...project().craft, trial: { start: 'The actual size is 50 mm.', action: 'Enter 48 mm.',
    result: 'Show 104.17%.', mistake: 'Enter zero.', recovery: 'Replace the invalid reading.' } },
  alternatives: [{ ...project().alternatives[0], name: 'Print scale' }, ...project().alternatives.slice(1)],
  cases: [checkpoint('primary', '48', '104.17%'), checkpoint('alternate', '41', '121.95%'),
    checkpoint('mistake', '0', 'Enter a positive length'), checkpoint('recovery', '52', '96.15%')],
});
const solutionHtml = `<!doctype html><html lang="en"><head><title>Print scale</title><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body><label>Measured length <input id="solution-measured" type="number" value="50"></label><button id="solution-calculate">Calculate</button>
<output id="solution-result">100.00%</output><script>
const measured = document.getElementById('solution-measured');
const result = document.getElementById('solution-result');
document.getElementById('solution-calculate').addEventListener('click', () => {
  const value = Number(measured.value);
  result.textContent = value > 0 ? (5000 / value).toFixed(2) + '%' : 'Enter a positive length';
});
</script></body></html>`;

test('problem-first candidates use reviewed Reddit and require direct evidence for feed leads', () => {
  const snapshot = solutionInput(), verified = solution();
  assert.equal(snapshot.solutionVersion, 1);
  assert.equal(snapshot.candidates[0].sourceId, 'reddit-reviewed');
  assert.ok(!SOLUTION_FEEDS.some(source => source.id.startsWith('reddit-')));
  assert.equal(reviewedProblems('problem-briefs.json', SOLUTIONS_FROM, [{ usedSources: verified.sourceIds }]).length, 1);
  assert.equal(reviewedProblems('problem-briefs.json', '2027-03-01', []).length, 0);
  assert.deepEqual(projectProblems(verified, snapshot), []);
  assert.match(projectProblems({ ...verified, sourceIds: ['daily-task'] }, snapshot).join(';'), /exactly one saved problem/);
  const liveLead = { ...feeds[0], kind: 'feed', summary: 'A printed pattern measures too large', published: SOLUTIONS_FROM };
  const feedSnapshot = { ...snapshot, candidates: [liveLead] };
  assert.match(projectProblems({ ...verified, sourceIds: [liveLead.id] }, feedSnapshot).join(';'), /proof.signal/);
  assert.deepEqual(projectProblems({ ...verified, sourceIds: [liveLead.id],
    proof: { ...verified.proof, signal: 'pattern measures too large' } }, feedSnapshot), []);
  const same = { ...verified, cases: [verified.cases[0], { ...verified.cases[0], phase: 'alternate' }, ...verified.cases.slice(2)] };
  assert.match(projectProblems(same, snapshot).join(';'), /different input and result/);
});

test('problem-first run records an empty or weak source day without building', async () => {
  const snapshot = solutionInput();
  snapshot.candidates = snapshot.candidates.filter(c => c.kind === 'task');
  await run([], [], ({ code, day, calls, output }) => {
    assert.equal(code, 1, output); assert.equal(calls.length, 0);
    assert.match(day.error, /No fresh problem leads/);
    assert.deepEqual(day.artifacts, []);
  }, snapshot);
  snapshot.candidates.unshift({ ...feeds[0], kind: 'feed' });
  await run(['```json\n{"noProblem":true}\n```'], [], ({ code, day, calls, output }) => {
    assert.equal(code, 1, output); assert.equal(calls.length, 1);
    assert.match(day.error, /No saved lead shows a concrete problem/);
    assert.deepEqual(day.artifacts, []);
  }, snapshot);
});

const browserTests = { skip: !process.env.CI && !process.env.CHROME && !existsSync(join('node_modules', 'playwright')) };
test('actual project checks an unseen input, retries a hardcoded result and exports browser proof', browserTests, async () => {
  const verified = solution();
  const broken = solutionHtml.replace("(5000 / value).toFixed(2) + '%'", "'104.17%'");
  await run([plan(verified), broken, solutionHtml], [], ({ code, day, calls, output, days, dir }) => {
    assert.equal(code, 0, output);
    assert.equal(calls.length, 3, output);
    assert.match(calls[2].messages.at(-1).content, /browser alternate failed/);
    assert.doesNotMatch(calls[1].messages[1].content, /121\.95%|96\.15%/);
    assert.deepEqual(day.artifacts[0].solutionCheck.passed, ['primary', 'alternate', 'mistake', 'recovery']);
    assert.deepEqual(day.artifacts[0].solutionCheck.quality, { phoneFit: true, keyboardReplay: true });
    const target = join(days, SOLUTIONS_FROM);
    assertProjectExport(day, target);
    const readme = dayReadme(day, days, '');
    assert.match(readme, /Problem source: Calibrate printed sewing patterns/);
    assert.match(readme, /Browser passed both inputs/);
    const site = join(dir, 'site');
    buildSite(site, [day], days, 'isas1/daily-team');
    const page = readFileSync(join(site, SOLUTIONS_FROM, 'index.html'), 'utf8');
    assert.match(page, /A pattern prints at the wrong size/);
    assert.match(page, /Browser passed both inputs/);
    delete day.artifacts[0].solutionCheck.quality;
    assert.throws(() => assertProjectExport(day, target), /passing browser receipt/);
  }, solutionInput());
});

test('the runner records a failed recovery and withholds the HTML then retries only the build on a new run', browserTests, async () => {
  const broken = solutionHtml.replace("result.textContent = value > 0 ?", "if (result.textContent === 'Enter a positive length') return; result.textContent = value > 0 ?");
  await run([plan(solution()).replace('## Clash', '## Debate'), broken, broken], [], async ({ code, day, calls, output, days }) => {
    assert.equal(code, 3, output);
    assert.equal(calls.length, 3, output);
    assert.equal(day.status, 'failed');
    assert.ok(day.planProblems.length);
    assert.match(day.error, /browser recovery failed/);
    assert.equal(existsSync(join(days, SOLUTIONS_FROM, 'artifact-1.html')), false);
    await run([solutionHtml], [], ({ code, output, calls, day: fixed }) => {
      assert.equal(code, 0, output);
      assert.match(output, /reusing the verified plan/);
      assert.equal(calls.length, 1);
      assert.equal(fixed.plan, day.plan);
      assert.deepEqual(fixed.planning.selectedSourceIds, day.planning.selectedSourceIds);
    }, solutionInput(), day);
  }, solutionInput());
});


test('browser rejects a horizontal overflow and a pointer-only submit control', browserTests, async () => {
  const browser = await openSolutionBrowser();
  try {
    const cases = solution().cases;
    const tooWide = solutionHtml.replace('</head>', '<style>body{width:700px}</style></head>');
    await assert.rejects(checkSolution(browser, addCsp(tooWide), cases, 1), /overflows the phone width/);
    const pointerOnly = solutionHtml.replace('<button id="solution-calculate">', '<button tabindex="-1" id="solution-calculate">');
    await assert.rejects(checkSolution(browser, addCsp(pointerOnly), cases, 1), /keyboard alternate failed: solution-calculate cannot take keyboard focus/);
  } finally { await browser.close(); }
});

test('browser accepts any new error wording for the mistake but still needs a visible change', browserTests, async () => {
  const browser = await openSolutionBrowser();
  try {
    const cases = solution().cases;
    const reworded = solutionHtml.replace("'Enter a positive length'", "'Length must be above zero.'");
    assert.deepEqual((await checkSolution(browser, addCsp(reworded), cases, 1)).passed, ['primary', 'alternate', 'mistake', 'recovery']);
    const silent = solutionHtml.replace("result.textContent = value > 0 ?", "if (!(value > 0)) return; result.textContent = value > 0 ?");
    await assert.rejects(checkSolution(browser, addCsp(silent), cases, 1), /browser mistake failed/);
  } finally { await browser.close(); }
});


test('cover drafting overlaps the build and a failed cover does not block the tool', { ...browserTests, timeout: 20_000 }, async () => {
  let coverResponse, buildResponse;
  function respond({ messages }, res) {
    const user = messages[1].content;
    if (user.includes('<planning_input')) return plan(solution());
    res.setTimeout(5_000, () => res.destroy());
    if (user.includes('Exact title:')) {
      if (messages.length > 2) return 'No cover';
      coverResponse = res;
    } else {
      buildResponse = res;
    }
    if (coverResponse && buildResponse) {
      sendReply(coverResponse, 'No cover');
      sendReply(buildResponse, solutionHtml);
    }
    return null;
  }
  await run(respond, ['--cover'], ({ code, day, calls, output }) => {
    assert.equal(code, 0, output);
    assert.equal(calls.length, 4, output);
    assert.equal(day.status, 'ok');
    assert.match(output, /cover skipped: no HTML code block/);
  }, solutionInput());
});
