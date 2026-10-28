// Exercise the real CLI with a deterministic mock provider, without model spend.
// node pack-sample.mjs [output-root]
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { sampleHtml, samplePlan } from './test-fixtures/pack.mjs';
import { assertPackExport } from './component-pack.mjs';

const root = resolve(process.argv[2] || 'work/pack-sample');
mkdirSync(root, { recursive: true });
const oldRecord = join(root, 'days', '2026-10-27', 'day.json');
if (existsSync(oldRecord) && JSON.parse(readFileSync(oldRecord)).model !== 'handwritten-fixture') throw new Error('sample refuses to overwrite non-fixture day');
const replies = [samplePlan(), ...Array.from({ length: 6 }, (_, i) => sampleHtml(i + 1)), sampleHtml()];
let calls = 0;
const server = createServer((req, res) => {
  req.resume(); req.on('end', () => {
    const text = replies[calls++]; res.writeHead(text ? 200 : 500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ model: 'handwritten-fixture', choices: [{ message: { content: text || '' } }] }));
  });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
try {
  const child = spawn(process.execPath, ['run.mjs', '--date', '2026-10-27', '--out', join(root, 'days'), '--offline', '--force'], {
    cwd: resolve('.'), stdio: 'inherit', env: { ...process.env, PROVIDER: 'openrouter', MODEL: 'handwritten-fixture',
      API_URL: `http://127.0.0.1:${server.address().port}`, OPENROUTER_API_KEY: 'sk-or-fixture', ARTIFACTS: '', COMPONENT_REQUESTS_FILE: '' },
  });
  const code = await new Promise(r => child.on('close', r));
  if (code) throw new Error(`sample CLI exited ${code}`);
  const dir = join(root, 'days', '2026-10-27'), day = JSON.parse(readFileSync(join(dir, 'day.json')));
  assertPackExport(day, dir);
  writeFileSync(join(root, 'evidence.json'), `${JSON.stringify({ kind: 'handwritten integration fixture', liveModelCalls: 0,
    mockProviderCalls: calls, generatedComponents: 6, demo: 'days/2026-10-27/piece.html', exportValidation: 'passed',
    libraryAccepted: 0, note: 'Browser evidence recorded separately; fixtures do not establish live model quality' }, null, 2)}\n`);
} finally { server.close(); }
