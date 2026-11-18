import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { acquireDay, atomicWrite, recoverDay } from './run-state.mjs';
import { hash } from './component-pack.mjs';
import { teamFor } from './team-session.mjs';

const date = '2026-10-03';
const html = '<!doctype html><html lang="en"><head><title>Test</title><meta name="viewport" content="width=device-width"></head><body><button>Go</button></body></html>';
const reply = `\`\`\`html\n${html}\n\`\`\``;
const temp = () => mkdtempSync(join(tmpdir(), 'daily-recovery-'));

async function serverRun(out, answers, args = [], inspect = () => {}) {
  const server = createServer((req, res) => {
    req.resume();
    inspect();
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ model: 'fixture', choices: [{ message: { content: answers.shift() || '' } }] }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const child = spawn(process.execPath, ['run.mjs', '--date', date, '--out', out, ...args], {
      cwd: import.meta.dirname, env: { ...process.env, PROVIDER: 'openrouter', OPENROUTER_API_KEY: 'fixture',
        API_URL: `http://127.0.0.1:${server.address().port}`, MODEL: 'fixture', RETRY_MS: '0', ARTIFACTS: '' },
    });
    let output = ''; child.stdout.on('data', (chunk) => output += chunk); child.stderr.on('data', (chunk) => output += chunk);
    const code = await new Promise((resolve) => child.on('close', resolve));
    return { code, output };
  } finally { server.close(); }
}

test('atomic records and backup recovery leave a complete published day', () => {
  const out = temp();
  try {
    const file = join(out, 'record.json');
    atomicWrite(file, '{"ok":true}\n');
    assert.deepEqual(JSON.parse(readFileSync(file)), { ok: true });
    assert.ok(!existsSync(`${file}.${process.pid}.tmp`));
    const backup = join(out, `.${date}.backup`);
    mkdirSync(backup); writeFileSync(join(backup, 'day.json'), '{"status":"ok"}');
    recoverDay(out, date);
    assert.equal(readFileSync(join(out, date, 'day.json'), 'utf8'), '{"status":"ok"}');
    assert.ok(!existsSync(backup));
  } finally { rmSync(out, { recursive: true, force: true }); }
});

test('day lock rejects another live writer', () => {
  const out = temp();
  try {
    const release = acquireDay(out, date);
    assert.throws(() => acquireDay(out, date), /already active/);
    release();
    const again = acquireDay(out, date); again();
  } finally { rmSync(out, { recursive: true, force: true }); }
});

test('interrupted stage resumes saved plan and artifact; published day stays until swap', async () => {
  const out = temp(), final = join(out, date), pending = join(out, `.${date}.pending`);
  try {
    mkdirSync(final); mkdirSync(pending);
    writeFileSync(join(final, 'day.json'), '{"status":"ok","marker":"old"}');
    writeFileSync(join(final, 'artifact-1.html'), 'old asset');
    const first = `${html}\n`; writeFileSync(join(pending, 'artifact-1.html'), first);
    const day = { date, task: 'Running pace calculator: x', brief: null, team: teamFor(date), provider: 'openrouter',
      model: 'fixture', status: 'building', plan: '## Decision\nA new table.', planProblems: ['saved warning'],
      artifacts: [{ file: 'artifact-1.html', sha256: hash(first), lead: 1, model: 'fixture', status: 'ok', problems: [] }] };
    writeFileSync(join(pending, 'day.json'), JSON.stringify(day));
    let calls = 0;
    const result = await serverRun(out, [reply], ['--artifacts', '2'], () => {
      calls++;
      assert.equal(readFileSync(join(final, 'artifact-1.html'), 'utf8'), 'old asset');
    });
    assert.equal(result.code, 0, result.output);
    assert.equal(calls, 1, 'saved plan and first artifact skip model calls');
    const current = JSON.parse(readFileSync(join(final, 'day.json')));
    assert.equal(current.artifacts.length, 2);
    assert.deepEqual(current.planProblems, ['saved warning']);
    assert.equal(readFileSync(join(final, 'artifact-1.html'), 'utf8'), first);
    assert.ok(!existsSync(pending));
  } finally { rmSync(out, { recursive: true, force: true }); }
});

test('failed force run keeps prior published assets and leaves staged evidence', async () => {
  const out = temp(), final = join(out, date), pending = join(out, `.${date}.pending`);
  try {
    mkdirSync(final);
    writeFileSync(join(final, 'day.json'), '{"status":"ok","marker":"old"}');
    writeFileSync(join(final, 'artifact-1.html'), 'old asset');
    const result = await serverRun(out, ['## Decision\nA new table.', 'bad html', 'bad html'], ['--force']);
    assert.equal(result.code, 3, result.output);
    assert.equal(readFileSync(join(final, 'artifact-1.html'), 'utf8'), 'old asset');
    assert.equal(JSON.parse(readFileSync(join(final, 'day.json'))).marker, 'old');
    assert.equal(JSON.parse(readFileSync(join(pending, 'day.json'))).status, 'failed');
    const retry = await serverRun(out, [], []);
    assert.equal(retry.code, 0, retry.output);
    assert.match(retry.output, /already recorded/);
    assert.equal(JSON.parse(readFileSync(join(final, 'day.json'))).marker, 'old');
  } finally { rmSync(out, { recursive: true, force: true }); }
});

test('finished stage after crash swaps without another model call', async () => {
  const out = temp(), final = join(out, date), pending = join(out, `.${date}.pending`);
  try {
    mkdirSync(final); mkdirSync(pending);
    writeFileSync(join(final, 'day.json'), '{"status":"ok","marker":"old"}');
    const asset = `${html}\n`; writeFileSync(join(pending, 'artifact-1.html'), asset);
    writeFileSync(join(pending, 'day.json'), JSON.stringify({ date, task: 'Running pace calculator: x', brief: null,
      team: teamFor(date), provider: 'openrouter', status: 'ok', completed: true, plan: '## Decision\nA table.',
      planProblems: [], artifacts: [{ file: 'artifact-1.html', sha256: hash(asset), status: 'ok' }] }));
    let calls = 0;
    const result = await serverRun(out, [], [], () => calls++);
    assert.equal(result.code, 0, result.output);
    assert.equal(calls, 0);
    assert.equal(readFileSync(join(final, 'artifact-1.html'), 'utf8'), asset);
    assert.ok(!existsSync(pending));
  } finally { rmSync(out, { recursive: true, force: true }); }
});
