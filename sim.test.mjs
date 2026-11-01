// node --test sim.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { appendFileSync, chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { findBanned, parseTeam, planSections, sections, sessionProblems, teamFor } from './run.mjs';
import { applyTurn, countVotes, createWorld, endRound, perceive, phaseEnds, phaseOf, rivals, scheduleEvents, startRound } from './sim/world.mjs';
import { parseTurn, takeTurn, turnProblems } from './sim/agent.mjs';
import { BudgetError, isSimDay, meteredAsk, readLog, readMemory, runSim, writeMemory } from './sim/run-sim.mjs';
import { afterClash, clashLines, clashSection, joinPlan, pitchSection } from './sim/adapter.mjs';
import { colourProblem, defaultLook, lookProblems, normalizeLook, sanitizePath } from './sim/rig.mjs';
import { designLook } from './sim/look.mjs';
import { tail } from './sim/live.mjs';
import { fakeComplete } from './sim/fake-model.mjs';
import { highlights, plain, scriptJson, watchHtml } from './sim-view.mjs';
import { buildSite, dayReadme } from './publish.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATE = '2026-10-31';
const tmp = () => mkdtempSync(join(tmpdir(), 'daily-team-sim-'));
const cast = () => parseTeam(teamFor(DATE)).members;
const world = (extra = {}) => createWorld({ date: DATE, members: cast(), task: 'Task', constraint: 'Rule', rounds: 12, events: [], ...extra });
const turn = (t) => ({ thought: '', say: null, move: 'stay', act: 'none', ...t });

// World and director

test('phases cover every round in order and end on the last round', () => {
  for (const rounds of [6, 8, 12, 16, 24]) {
    const ends = phaseEnds(rounds);
    assert.deepEqual(ends.map(([p]) => p), ['arrive', 'pitch', 'clash', 'decide', 'build', 'wrap']);
    assert.equal(ends.at(-1)[1], rounds);
    for (let i = 1; i < ends.length; i++) assert.ok(ends[i][1] > ends[i - 1][1], `${rounds}: ${JSON.stringify(ends)}`);
  }
  assert.equal(phaseOf(1, 16), 'arrive');
  assert.equal(phaseOf(7, 16), 'clash');
  assert.equal(phaseOf(16, 16), 'wrap');
});

test('events and rivals are the same for the same date and never point at yourself', () => {
  const members = cast().map((m) => ({ ...m, label: m.role }));
  assert.deepEqual(scheduleEvents(DATE, 16, members), scheduleEvents(DATE, 16, members));
  const ev = scheduleEvents(DATE, 16, members);
  assert.ok(ev.some((e) => e.phase === 'clash') && ev.some((e) => e.phase === 'build'));
  const noGuest = members.map((m) => ({ ...m, guest: null }));
  assert.ok(!scheduleEvents(DATE, 16, noGuest).some((e) => e.kind === 'late'));
  for (const d of ['2026-10-01', '2026-10-31', '2027-03-04']) rivals(d).forEach((r, i) => assert.notEqual(r, i));
});

test('pitching, blocking, the keyboard and energy follow the studio rules', () => {
  const w = world();
  const [a, b, c] = w.members;
  while (w.phase !== 'pitch') startRound(w);
  let ev = applyTurn(w, a, turn({ move: 'whiteboard', act: 'pitch', concept: 'Wire', say: { to: 'all', text: 'A wire.' } }));
  assert.equal(w.board.length, 1);
  ev = applyTurn(w, a, turn({ act: 'pitch', concept: 'Again' }));
  assert.ok(ev.some((e) => e.type === 'refused' && /already pitched/.test(e.text)));
  ev = applyTurn(w, b, turn({ act: 'pitch', concept: 'Far away' }));
  assert.ok(ev.some((e) => e.type === 'refused' && /whiteboard/.test(e.text)), 'pitch needs the whiteboard');
  while (w.phase !== 'clash') startRound(w);
  ev = applyTurn(w, b, turn({ move: 'whiteboard', act: 'block', target: 'P1', say: { to: a.label, text: 'It hides the failure.' } }));
  assert.equal(a.trust[b.label], -1);
  assert.ok(ev.at(-1).type === 'beat' && ev.at(-1).why === 'block', 'beats come after the line that caused them');
  assert.equal(ev.find((e) => e.type === 'say').to, a.label);
  ev = applyTurn(w, c, turn({ move: 'whiteboard', act: 'back', target: 'p1' }));
  assert.equal(a.trust[c.label], 1);
  while (w.phase !== 'build') startRound(w);
  applyTurn(w, a, turn({ move: 'workbench', act: 'type' }));
  assert.equal(w.keyboard, a.label);
  ev = applyTurn(w, b, turn({ move: 'workbench', act: 'type' }));
  assert.ok(ev.some((e) => e.type === 'refused' && /holds the keyboard/.test(e.text)));
  a.energy = 0;
  ev = applyTurn(w, a, turn({ move: 'whiteboard', act: 'type' }));
  assert.equal(a.station, 'kitchen');
  assert.equal(w.keyboard, null, 'leaving the workbench frees the keyboard');
  assert.ok(ev.some((e) => e.type === 'act' && e.act === 'rest'));
});

test('a tied vote goes to the lead, and non-voters fall back to what they backed', () => {
  const w = world();
  const [a, b, c, d] = w.members;
  for (const m of w.members) { m.station = 'whiteboard'; }
  while (w.phase !== 'pitch') startRound(w);
  applyTurn(w, a, turn({ act: 'pitch', concept: 'A' }));
  applyTurn(w, b, turn({ act: 'pitch', concept: 'B' }));
  while (w.phase !== 'decide') startRound(w);
  applyTurn(w, b, turn({ act: 'vote', target: 'P2' }));
  applyTurn(w, c, turn({ act: 'vote', target: 'P2' }));
  applyTurn(w, a, turn({ act: 'vote', target: 'P1' }));
  applyTurn(w, d, turn({ act: 'vote', target: 'P1' }));
  const ev = countVotes(w);
  assert.equal(w.result.id, 'P1');
  assert.equal(w.result.tie, true);
  assert.ok(ev.some((e) => e.type === 'beat' && /lead breaks a tie/.test(e.text)));
});

test('the director nudges a quiet Clash once, and members only hear their own station', () => {
  const w = world();
  for (const m of w.members) m.station = 'whiteboard';
  while (w.phase !== 'pitch') startRound(w);
  for (const m of w.members) applyTurn(w, m, turn({ act: 'pitch', concept: m.label }));
  while (w.phase === 'pitch' || w.phase === 'clash') { startRound(w); if (w.nudged) break; }
  assert.ok(w.nudged && w.members.some((m) => m.nudge));
  const [a, b] = w.members;
  a.station = 'kitchen'; b.station = 'workbench';
  endRound(w, [{ type: 'say', who: a.label, to: 'all', station: 'kitchen', text: 'Secret kitchen plan.' }]);
  assert.doesNotMatch(perceive(w, b), /Secret kitchen plan/);
  w.members[2].station = 'kitchen';
  assert.match(perceive(w, w.members[2]), /Secret kitchen plan/);
});

// Agents

test('member answers are parsed and checked against the writing and guest rules', () => {
  const m = { label: 'Camera operator', historical: false };
  assert.deepEqual(parseTurn('```json\n{"say":"hi","act":"none"}\n```').say, { to: 'all', text: 'hi' });
  assert.throws(() => parseTurn('no json here'));
  const p = (t, who = m) => turnProblems(t, who, findBanned);
  assert.deepEqual(p({ say: { text: 'A clear edge.' }, move: 'wall', act: 'none' }), []);
  assert.ok(p({ say: { text: 'A seamless edge.' } }).some((x) => /seamless/.test(x)));
  assert.ok(p({ say: { text: 'Look at this!' } }).some((x) => /exclamation/.test(x)));
  assert.ok(p({ thought: 'Nice \u{1F600}' }).some((x) => /emoji/.test(x)));
  assert.ok(p({ say: { text: 'As a camera operator, I frame it.' } }).some((x) => /As a/.test(x)));
  assert.ok(p({ thought: Array(45).fill('w').join(' ') }).some((x) => /thought/.test(x)));
  assert.ok(p({ move: 'roof' }).length && p({ act: 'dance' }).length);
  assert.ok(p({ act: 'pitch' }).some((x) => /concept/.test(x)));
  assert.ok(p({ say: { text: 'When I sailed south we measured ice.' } }, { label: 'X', historical: true }).some((x) => /historical/.test(x)));
});

test('a member gets one retry, then stays quiet; the cost cap stops the day', async () => {
  const replies = ['not json', '{"say":{"to":"all","text":"Fine."},"act":"none"}'];
  const ask = async () => ({ text: replies.shift() ?? 'still not json', model: 'm' });
  const r = await takeTurn(ask, { label: 'A', method: 'm', stance: 's' }, 'view', sections(), findBanned);
  assert.equal(r.idle, false);
  const r2 = await takeTurn(async () => ({ text: 'nope', model: 'm' }), { label: 'A', method: 'm', stance: 's' }, 'view', sections(), findBanned);
  assert.equal(r2.idle, true);
  const { ask: capped } = meteredAsk(async () => ({ text: '{}', costUsd: 1 }), 'm', 0.5);
  await capped([], 10);
  await assert.rejects(capped([], 10), (e) => e instanceof BudgetError && e.budget);
});

test('sim days come from the flag, the list, or the env list', () => {
  assert.equal(isSimDay('2026-11-02', {}), false);
  assert.equal(isSimDay('2026-11-02', { SIM: '1' }), true);
  assert.equal(isSimDay('2026-11-02', { SIM_DAYS: '2026-11-01, 2026-11-02' }), true);
});

// A full day with the scripted model

async function fakeDay(dir, rounds = 12) {
  const t = parseTeam(teamFor(DATE));
  const { ask, meter } = meteredAsk(fakeComplete(), 'fake');
  const out = await runSim({ ask, date: DATE, members: t.members, task: t.task, constraint: t.constraint, rounds, sections: sections(), findBanned, logPath: join(dir, 'sim.jsonl') });
  return { ...out, meter };
}

test('a scripted day runs, logs every event in order, and is repeatable', async () => {
  const dir = tmp();
  const a = await fakeDay(dir);
  const b = await fakeDay(tmp());
  assert.deepEqual(a.events, b.events);
  const log = readLog(join(dir, 'sim.jsonl'));
  assert.equal(log.header.v, 1);
  assert.equal(log.header.members.length, 4);
  assert.deepEqual(log.events.map((e) => e.seq), log.events.map((_, i) => i));
  assert.ok(a.world.result, 'the vote picked something');
  assert.equal(a.meter.calls, 48);
  for (const type of ['phase', 'say', 'think', 'move', 'act', 'beat', 'result', 'end']) assert.ok(log.events.some((e) => e.type === type), type);
});

test('the adapter turns a day into a session the pipeline accepts', async () => {
  const { world: w, events } = await fakeDay(tmp());
  const lines = clashLines(events);
  assert.ok(lines.length >= 6 && lines.length <= 10, `${lines.length} lines`);
  const turns = {};
  for (const l of lines) turns[l.who] = (turns[l.who] ?? 0) + 1;
  assert.ok(Object.values(turns).every((n) => n <= 3));
  const plan = joinPlan(pitchSection(w, events), clashSection(events), '## Pitch\nignored\n\n## Decision\nThe team builds a panel.\n\nConcept: Quiet Panel\n\n## Build notes\n1. a');
  assert.deepEqual(sessionProblems(plan), []);
  assert.doesNotMatch(planSections(plan).Pitch, /ignored/);
  assert.equal(afterClash('## Clash\nx\n## Decision\ny'), '## Decision\ny');
});

test('season memory keeps the last notes per role and feeds the next day', async () => {
  const dir = tmp();
  const { world: w } = await fakeDay(tmp());
  writeMemory(dir, 'S1', DATE, w);
  const mem = readMemory(dir, 'S1');
  assert.equal(Object.keys(mem).length, 4);
  const next = createWorld({ date: '2026-11-01', members: cast(), task: 't', constraint: 'c', rounds: 12, events: [], memory: mem });
  assert.match(perceive(next, next.members[0]), /You remember from earlier days/);
});

// Look and rig

test('the rig drops anything that is not plain path data or a hex colour', () => {
  assert.equal(sanitizePath('M2 2 L10 10 Z'), 'M2 2 L10 10 Z');
  for (const bad of ['M0 0"/><script>alert(1)</script>', 'javascript:alert(1)', 'M0 0 L999 0', 'L0 0', 'M0 0 url(x)', 12]) assert.equal(sanitizePath(bad), '', String(bad));
  assert.equal(colourProblem('#39ff14'), 'neon');
  assert.equal(colourProblem('#efe8d8', true), 'beige or cream ground');
  assert.equal(colourProblem('#c43d12'), '');
  const members = cast();
  const look = normalizeLook({ set: { floor: '#efe8d8', ink: 'red', paths: { door: '<path/>' } }, members: [{ label: members[0].role, body: 'dragon', palette: ['#39ff14', 'x'], traits: ['laser', 'hat'], propPath: 'M0 0 L4 4' }] }, members, DATE);
  assert.notEqual(look.set.floor, '#efe8d8');
  assert.deepEqual(look.set.paths, {});
  assert.equal(look.members.length, 4);
  assert.notEqual(look.members[0].body, 'dragon');
  assert.notEqual(look.members[0].palette[0], '#39ff14');
  assert.deepEqual(look.members[0].traits, ['hat']);
  const sigs = look.members.map((m) => `${m.body}|${m.traits.slice().sort()}`);
  assert.equal(new Set(sigs).size, 4, 'four members never look the same');
  assert.ok(lookProblems({ set: {}, members: [] }, members).length > 3);
  assert.deepEqual(lookProblems(defaultLook(members, DATE), members), []);
});

test('the look call falls back to defaults and never touches day.json', async () => {
  const dir = tmp();
  const day = { date: DATE, team: teamFor(DATE), task: 't', concept: 'C', decision: 'D' };
  writeFileSync(join(dir, 'day.json'), JSON.stringify(day));
  const before = readFileSync(join(dir, 'day.json'), 'utf8');
  const good = JSON.stringify(defaultLook(cast(), DATE));
  const ok = await designLook(day, dir, { complete: async () => ({ text: good, model: 'm' }) });
  assert.equal(ok.status, 'ok');
  const bad = await designLook(day, dir, { complete: async () => { throw new Error('down'); } });
  assert.equal(bad.status, 'default');
  assert.equal(bad.look.members.length, 4);
  assert.equal(readFileSync(join(dir, 'day.json'), 'utf8'), before);
});

// Replay page and publishing

async function simDayFolder() {
  const days = tmp();
  const dir = join(days, DATE);
  mkdirSync(dir, { recursive: true });
  const { events } = await fakeDay(dir);
  // A hostile line from a model must stay inert in the page.
  appendFileSync(join(dir, 'sim.jsonl'), `${JSON.stringify({ r: 12, phase: 'wrap', seq: events.length, type: 'say', who: cast()[0].role, to: 'all', text: '</script><script>alert(1)</script> [x](http://evil) <img src=x>' })}\n`);
  writeFileSync(join(dir, 'artifact-1.html'), '<!doctype html><title>T</title><meta name="viewport" content="width=device-width"><p>ok</p>');
  const day = {
    date: DATE, task: 'Pipeline panel: a panel.', brief: null, team: teamFor(DATE), provider: 'claude', model: 'm', studio: false, component: false,
    status: 'ok', error: null, decision: 'The team builds a panel.', concept: 'Quiet Panel', plan: '', planProblems: [], referee: false,
    artifacts: [{ file: 'artifact-1.html', lead: 1, model: 'm', status: 'ok', problems: [] }], sim: { log: 'sim.jsonl', rounds: 12 },
  };
  writeFileSync(join(dir, 'day.json'), JSON.stringify(day));
  return { days, dir, day };
}

test('watch.html is one offline page and model text cannot escape its data block', async () => {
  const { dir, day } = await simDayFolder();
  const html = watchHtml(day, dir, { csp: "default-src 'none'; script-src 'unsafe-inline'" });
  assert.equal((html.match(/<script\b/g) ?? []).length, 2, 'only the data block and the viewer');
  assert.equal((html.match(/<\/script>/g) ?? []).length, 2);
  assert.doesNotMatch(html, /<img src=x>/);
  assert.doesNotMatch(html, /\b(src|href)\s*=\s*["']?https?:/i);
  const viewer = readFileSync(join(HERE, 'sim', 'viewer.js'), 'utf8');
  assert.doesNotMatch(viewer, /\.innerHTML\b|\bfetch\s*\(|XMLHttpRequest|eval\(|new Function/);
  assert.ok(viewer.includes('textContent'));
  assert.equal(JSON.parse(scriptJson({ s: '</script>& ' })).s, '</script>& ');
  assert.match(html, /http-equiv="Content-Security-Policy"/);
});

test('days with a sim get a Watch link and highlights; other days do not change', async () => {
  const { days, dir, day } = await simDayFolder();
  const readme = dayReadme(day, days, 'https://example.test/daily-team/');
  assert.match(readme, /## The studio/);
  assert.match(readme, /\[Watch the day\]\(https:\/\/example\.test\/daily-team\/2026-10-31\/watch\.html\)/);
  assert.doesNotMatch(readme, /evil|<img src=x/);
  const h = highlights(day, dir);
  assert.ok(h.beats.length > 0 && h.beats.length <= 8);
  assert.equal(plain('[a](b) <i>!'), 'a b i');
  const plainDay = { ...day, sim: undefined };
  assert.doesNotMatch(dayReadme(plainDay, days, 'https://example.test/'), /The studio|Watch the day/);
  const site = tmp();
  buildSite(site, [day], days, 'isas1/daily-team', 'https://example.test/');
  assert.ok(existsSync(join(site, DATE, 'watch.html')));
  assert.match(readFileSync(join(site, DATE, 'index.html'), 'utf8'), /watch\.html/);
});

test('live mode tails new lines of the log', () => {
  const p = join(tmp(), 'sim.jsonl');
  const read = tail(p);
  assert.deepEqual(read(), []);
  writeFileSync(p, '{"a":1}\n{"b"');
  assert.deepEqual(read(), ['{"a":1}']);
  appendFileSync(p, ':2}\n');
  assert.deepEqual(read(), ['{"b":2}']);
});

// run.mjs end to end, with a fake claude CLI that plays the scripted model

function fakeCli(dir) {
  const bin = join(dir, 'claude');
  writeFileSync(bin, `#!${process.execPath}
const fs = require('fs');
const args = process.argv.slice(2);
const system = args[args.indexOf('--system-prompt') + 1];
let input = '';
process.stdin.on('data', (c) => { input += c; });
process.stdin.on('end', async () => {
  fs.appendFileSync(${JSON.stringify(join(dir, 'calls.log'))}, args[args.indexOf('--model') + 1] + '\\n');
  const { fakeComplete } = await import(${JSON.stringify(pathToFileURL(join(HERE, 'sim', 'fake-model.mjs')).href)});
  let text;
  if (/Build one artifact from the decision/.test(input)) text = '\`\`\`html\\n<!doctype html><html><head><meta name="viewport" content="width=device-width"><title>Panel</title></head><body>ok</body></html>\\n\`\`\`';
  else text = (await fakeComplete()([{ role: 'system', content: system }, { role: 'user', content: input }])).text;
  process.stdout.write(JSON.stringify({ type: 'result', is_error: false, result: text, total_cost_usd: 0.01, modelUsage: { 'claude-test': {} } }));
});
`);
  chmodSync(bin, 0o755);
  return bin;
}

function run(args, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [join(HERE, 'run.mjs'), ...args], { env: { ...process.env, PROVIDER: '', ...env } });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c) => { stdout += c; });
    child.stderr.on('data', (c) => { stderr += c; });
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

test('run.mjs plays a studio day on SIM=1 and records the sim with the plan', async () => {
  const dir = tmp();
  const out = join(dir, 'days');
  const r = await run(['--provider', 'claude', '--date', '2026-10-03', '--out', out],
    { CLAUDE_BIN: fakeCli(dir), CLAUDE_CODE_OAUTH_TOKEN: '', SIM: '1', SIM_ROUNDS: '8', SIM_MODEL: 'haiku-test' });
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const day = JSON.parse(readFileSync(join(out, '2026-10-03', 'day.json'), 'utf8'));
  assert.equal(day.sim.rounds, 8);
  assert.equal(day.sim.log, 'sim.jsonl');
  assert.ok(day.sim.costUsd > 0);
  assert.equal(day.concept, 'Quiet Panel');
  assert.ok(planSections(day.plan).Pitch && planSections(day.plan).Clash);
  assert.ok(existsSync(join(out, '2026-10-03', 'sim.jsonl')));
  assert.ok(readLog(join(out, '2026-10-03', 'sim.jsonl')).events.some((e) => e.type === 'interview'));
  assert.ok(existsSync(join(out, '_studio')), 'season memory written');
  const models = readFileSync(join(dir, 'calls.log'), 'utf8').trim().split('\n');
  assert.ok(models.includes('haiku-test'), 'member turns use the sim model');
});

test('run.mjs falls back to the single plan call when the sim hits its cost cap', async () => {
  const dir = tmp();
  const out = join(dir, 'days');
  const r = await run(['--provider', 'claude', '--date', '2026-10-03', '--out', out],
    { CLAUDE_BIN: fakeCli(dir), CLAUDE_CODE_OAUTH_TOKEN: '', SIM: '1', SIM_ROUNDS: '8', SIM_MAX_USD: '0' });
  const day = JSON.parse(readFileSync(join(out, '2026-10-03', 'day.json'), 'utf8'));
  assert.equal(day.sim.status, 'fallback', r.stderr);
  assert.match(day.sim.error, /cap/);
  assert.ok(!existsSync(join(out, '2026-10-03', 'sim.jsonl')));
  assert.ok(day.plan, 'the day still has a plan');
});
