import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildComparison, comparisonRows } from './compare.mjs';
import { claudeArgs } from './run.mjs';
import { buildSite, dayReadme } from './publish.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const MODELS = ['opus', 'sonnet', 'haiku'].map((key) => ({ key, label: key, model: `claude-${key}-5-5` }));
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'comparison-test-'));
  const day = JSON.parse(readFileSync(join(HERE, 'days/2026-10-21/day.json'), 'utf8'));
  day.artifacts = day.artifacts.filter((a) => a.row === 1);
  const html = readFileSync(join(HERE, 'days/2026-10-21/artifact-1.html'), 'utf8');
  writeFileSync(join(dir, 'day.json'), JSON.stringify(day));
  writeFileSync(join(dir, 'artifact-1.html'), html);
  return { dir, day, html };
}

test('comparison uses one plan, explicit models, and resumes completed variants', async () => {
  const { dir, day, html } = fixture(), calls = [];
  try {
    assert.equal(comparisonRows(day)[0].name, 'Mordant Rack');
    const complete = async (messages, max, model) => { calls.push({ messages, model }); return { text: html, model }; };
    const record = await buildComparison(dir, { models: MODELS, complete });
    assert.equal(record.status, 'ok');
    assert.deepEqual(calls.map((c) => c.model), ['claude-sonnet-5-5', 'claude-haiku-5-5']);
    assert.deepEqual(calls[0].messages, calls[1].messages);
    assert.match(calls[0].messages[1].content, /Build variation 1 from the table/);
    assert.ok(record.hook.split(/\s+/).length >= 3 && record.hook.split(/\s+/).length <= 7);
    assert.match(record.rows[0].variants.opus.file, /^artifact-1/);
    await buildComparison(dir, { models: MODELS, complete });
    assert.equal(calls.length, 2);
    const args = claudeArgs('rules', 'claude-haiku-5-5');
    assert.equal(args[args.indexOf('--model') + 1], 'claude-haiku-5-5');
    const view = readFileSync(join(dir, 'comparison.html'), 'utf8');
    assert.match(view, /frame.sandbox = 'allow-scripts'/);
    assert.match(view, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
    assert.equal(readFileSync(join(dir, 'artifact-1.html'), 'utf8'), html);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('model mismatch cannot be labeled as another model and missing output stays explicit', async () => {
  const { dir, html } = fixture();
  try {
    const record = await buildComparison(dir, { models: MODELS,
      complete: async () => ({ text: html, model: 'claude-opus-5-5' }) });
    assert.equal(record.status, 'incomplete');
    assert.equal(record.rows[0].variants.haiku.status, 'failed');
    assert.match(record.rows[0].variants.haiku.problems[0], /requested claude-haiku-5-5/);
    const view = readFileSync(join(dir, 'comparison.html'), 'utf8');
    assert.match(view, /Generation failed/);
    await assert.rejects(buildComparison(dir, { seconds: 2, models: MODELS }), /between 3 and 5/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('view-only does not invoke a provider and embeds source safely', async () => {
  const { dir, day } = fixture();
  try {
    day.task = 'Color swatch: </script><script>bad()</script>';
    writeFileSync(join(dir, 'day.json'), JSON.stringify(day));
    const record = await buildComparison(dir, { models: MODELS, viewOnly: true,
      complete: () => assert.fail('view-only called a model') });
    assert.equal(record.rows[0].variants.haiku.status, 'missing');
    const view = readFileSync(join(dir, 'comparison.html'), 'utf8');
    assert.ok(!view.includes('</script><script>bad()'));
    assert.match(view, /Not generated/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('changed timing invalidates stale video, while an identical view rebuild keeps it', async () => {
  const { dir, html, day } = fixture();
  try {
    day.task = 'Toggle: switch a thing.';
    writeFileSync(join(dir, 'day.json'), JSON.stringify(day));
    const record = await buildComparison(dir, { models: MODELS, complete: async (_, __, model) => ({ text: html, model }) });
    assert.equal(record.hook, 'Build one Toggle');
    const sourceHash = createHash('sha256').update(readFileSync(join(dir, 'comparison.html'))).digest('hex');
    writeFileSync(join(dir, 'comparison-qa.json'), JSON.stringify({ sourceHash }));
    writeFileSync(join(dir, 'comparison.mp4'), 'video');
    await buildComparison(dir, { models: MODELS, viewOnly: true });
    assert.ok(existsSync(join(dir, 'comparison.mp4')));
    await buildComparison(dir, { models: MODELS, seconds: 5, viewOnly: true });
    assert.ok(!existsSync(join(dir, 'comparison.mp4')));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('published comparison links resolve on day pages and the root page', () => {
  const { dir, day } = fixture();
  try {
    const days = join(dir, 'days'), target = join(days, day.date), site = join(dir, 'site');
    mkdirSync(target, { recursive: true });
    for (const f of ['comparison.html', 'comparison.png', 'comparison.mp4']) writeFileSync(join(target, f), f);
    const md = dayReadme(day, days, '');
    assert.match(md, /\[Compare Opus, Sonnet, and Haiku\]\(comparison.html\)/);
    buildSite(site, [day], days, 'isas1/daily-team');
    assert.match(readFileSync(join(site, day.date, 'index.html'), 'utf8'), /href="comparison.html"/);
    assert.match(readFileSync(join(site, 'index.html'), 'utf8'), /href="\.\/2026-10-21\/comparison.mp4"/);
    assert.equal(readFileSync(join(site, day.date, 'comparison.html'), 'utf8'), 'comparison.html');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
