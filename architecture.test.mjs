import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { completeChecked, completeClaude, completeOpenRouter, prepareProvider } from './providers.mjs';

// Guard the actual static ESM graph, including paths through other shared modules.
test('shared modules stay below CLI entry points and production modules never import run.mjs', () => {
  const files = ['', 'sim'].flatMap((dir) => readdirSync(join(import.meta.dirname, dir))
    .filter((file) => file.endsWith('.mjs') && !/^(test\.mjs|.*\.test\.mjs)$/.test(file))
    .map((file) => join(dir, file)));
  const graph = new Map(files.map((file) => [file, [...readFileSync(new URL(file, import.meta.url), 'utf8')
    .matchAll(/(?:import|export)\s+[\s\S]*?\bfrom\s+['"](\.\.?\/[^'"]+)['"]/g)]
    .map((match) => normalize(join(dirname(file), match[1])))]));
  const shared = new Set(['team-session.mjs', 'prompt-rules.mjs', 'artifact-policy.mjs', 'providers.mjs', 'security.mjs']);
  function visit(file, path = []) {
    assert.ok(!path.includes(file), `dependency cycle: ${[...path, file].join(' -> ')}`);
    for (const dependency of graph.get(file) || []) {
      assert.notEqual(dependency, 'run.mjs', `${file} imports the generation CLI`);
      if (shared.has(file)) assert.ok(shared.has(dependency), `${file} depends on higher-level ${dependency}`);
      visit(dependency, [...path, file]);
    }
  }
  for (const file of files) visit(file);
});

test('run.mjs retains the shared export API', async () => {
  const runner = await import('./run.mjs');
  for (const file of ['team-session.mjs', 'prompt-rules.mjs', 'artifact-policy.mjs', 'providers.mjs']) {
    const owner = await import(`./${file}`);
    for (const [name, value] of Object.entries(owner)) assert.equal(runner[name], value, `${file}: ${name}`);
  }
});

function environment(t, values) {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  Object.assign(process.env, values);
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

test('provider configuration errors are catchable and never exit the host', (t) => {
  environment(t, { API_URL: '', OPENROUTER_API_KEY: '', CLAUDE_CODE_OAUTH_TOKEN: 'invalid-fixture-token' });
  t.mock.method(process, 'exit', () => assert.fail('provider exited the host'));
  for (const [provider, message] of [
    ['openrouter', /OPENROUTER_API_KEY is not set/],
    ['claude', /does not look like a token/],
    ['unknown', /provider must be openrouter or claude/],
  ]) {
    assert.throws(() => prepareProvider(provider), (error) => {
      assert.equal(error.exitCode, 2);
      assert.match(error.message, message);
      assert.doesNotMatch(error.message, /invalid-fixture-token/);
      return true;
    });
  }
  process.env.OPENROUTER_API_KEY = ' sk-or-fixture ';
  assert.equal(prepareProvider('openrouter'), completeOpenRouter);
  assert.equal(process.env.OPENROUTER_API_KEY, 'sk-or-fixture');
  process.env.CLAUDE_CODE_OAUTH_TOKEN = ' ';
  assert.equal(prepareProvider('claude'), completeClaude);
  assert.equal(process.env.CLAUDE_CODE_OAUTH_TOKEN, undefined);
});

test('OpenRouter reads changed endpoint and model config after import', async (t) => {
  environment(t, { API_URL: 'https://first.invalid/chat', MODEL: 'first', OPENROUTER_API_KEY: 'fixture' });
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const body = JSON.parse(options.body);
    calls.push({ url, body });
    return { ok: true, json: async () => ({ choices: [{ message: { content: 'answer' } }] }) };
  });
  const messages = [{ role: 'user', content: 'fixture' }];
  assert.deepEqual(await completeOpenRouter(messages, 42), { text: 'answer', model: 'first' });
  process.env.API_URL = 'https://second.invalid/chat';
  process.env.MODEL = ' second ';
  assert.deepEqual(await completeOpenRouter(messages, 43), { text: 'answer', model: 'second' });
  assert.deepEqual(calls, [
    { url: 'https://first.invalid/chat', body: { model: 'first', messages, max_tokens: 42 } },
    { url: 'https://second.invalid/chat', body: { model: 'second', messages, max_tokens: 43 } },
  ]);
});

test('OpenRouter retains bounded rate-limit retries and model fallback', async (t) => {
  environment(t, { API_URL: 'https://fixture.invalid/chat', MODEL: 'a,b', OPENROUTER_API_KEY: 'fixture', RETRY_MS: '0' });
  const models = [];
  t.mock.method(globalThis, 'fetch', async (_, options) => {
    models.push(JSON.parse(options.body).model);
    return models.length < 3
      ? { ok: false, status: 429, json: async () => ({}) }
      : { ok: true, json: async () => ({ model: 'actual-b', choices: [{ message: { content: 'answer' } }] }) };
  });
  assert.deepEqual(await completeOpenRouter([], 42), { text: 'answer', model: 'actual-b' });
  assert.deepEqual(models, ['a', 'a', 'b']);
});

test('validation retries once without mutating the original conversation', async () => {
  const messages = [{ role: 'user', content: 'fixture' }], calls = [];
  const result = await completeChecked(async (conversation) => {
    calls.push(conversation);
    return { text: 'bad', model: 'fixture' };
  }, messages, 42, () => ['still invalid']);
  assert.equal(calls.length, 2);
  assert.deepEqual(messages, [{ role: 'user', content: 'fixture' }]);
  assert.match(calls[1].at(-1).content, /still invalid/);
  assert.deepEqual(result.problems, ['still invalid']);
});
