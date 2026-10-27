import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { runInNewContext } from 'node:vm';
import { markupText, markdownCell, redactCredentials } from './security.mjs';
import { decisionLine } from './run.mjs';

test('plain-text extraction drops raw blocks and leaves no markup delimiters', () => {
  const input = '<title>Title</title><SCRIPT type="module">hidden</SCRIPT><STYLE>hidden</STYLE><p>Visible</p><scr<script>ipt>tail<';
  const text = markupText(input);
  assert.doesNotMatch(text, /[<>]|hidden/);
  assert.match(text, /Title.*Visible/);
  assert.doesNotMatch(markupText(input, true), /Title/);
});

test('Markdown cells preserve literal backslashes before pipes and contain no raw HTML or newlines', () => {
  assert.equal(markdownCell('a\\|b'), 'a\\\\\\|b');
  assert.equal(markdownCell(' <SCRIPT>x</SCRIPT>\r\nnext & end '), '&lt;SCRIPT&gt;x&lt;/SCRIPT&gt; next &amp; end');
});

test('decision headlines discard executable blocks and never reconstruct markup', () => {
  assert.equal(decisionLine('## Decision\nA <em>useful</em> <SCRIPT>bad()</SCRIPT>tool. More.'), 'A useful tool.');
  assert.doesNotMatch(decisionLine('## Decision\n<scr<script>ipt> tail<'), /[<>]/);
});

test('credential validation errors reveal neither token nor length', () => {
  const out = mkdtempSync(join(tmpdir(), 'daily-security-'));
  try {
    for (const [provider, name, secret] of [
      ['openrouter', 'OPENROUTER_API_KEY', 'invalid-router-secret'],
      ['claude', 'CLAUDE_CODE_OAUTH_TOKEN', 'invalid-claude-secret'],
    ]) {
      const result = spawnSync(process.execPath, ['run.mjs', '--provider', provider, '--date', '2026-10-03', '--out', out], {
        cwd: import.meta.dirname, encoding: 'utf8', env: { ...process.env, API_URL: '', [name]: secret },
      });
      assert.equal(result.status, 2, result.stderr);
      assert.match(result.stderr, /does not look like/);
      assert.ok(!result.stderr.includes(secret));
      assert.doesNotMatch(result.stderr, /length \d+/);
    }
  } finally { rmSync(out, { recursive: true, force: true }); }
});

test('error redaction handles repeated credentials, trim, overlap, and regex characters', () => {
  const before = { OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY, CLAUDE_CODE_OAUTH_TOKEN: process.env.CLAUDE_CODE_OAUTH_TOKEN };
  try {
    process.env.OPENROUTER_API_KEY = ' sk-or-a.$*long ';
    process.env.CLAUDE_CODE_OAUTH_TOKEN = 'sk-or-a.$*';
    assert.equal(redactCredentials(' sk-or-a.$*long / sk-or-a.$* / sk-or-a.$*long'), '[REDACTED]/ [REDACTED] / [REDACTED]');
  } finally {
    for (const [name, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
});

test('provider error credentials never reach stderr or the failed day record', async () => {
  const secret = 'sk-or-test-error-echo-secret';
  const out = mkdtempSync(join(tmpdir(), 'daily-security-'));
  const server = createServer((req, res) => {
    req.resume();
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { message: `Invalid credential: ${secret}` } }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const result = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['run.mjs', '--provider', 'openrouter', '--date', '2026-10-03', '--out', out], {
        cwd: import.meta.dirname, env: { ...process.env, MODEL: 'mock', OPENROUTER_API_KEY: secret,
          API_URL: `http://127.0.0.1:${server.address().port}/chat` },
      });
      let output = '';
      child.stdout.on('data', (chunk) => { output += chunk; });
      child.stderr.on('data', (chunk) => { output += chunk; });
      child.on('error', reject);
      child.on('close', (status) => resolve({ status, output }));
    });
    assert.equal(result.status, 1);
    assert.ok(!result.output.includes(secret));
    assert.match(result.output, /Invalid credential: \[REDACTED\]/);
    const record = readFileSync(join(out, '2026-10-03/day.json'), 'utf8');
    assert.ok(!record.includes(secret));
    assert.match(JSON.parse(record).error, /\[REDACTED\]/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    rmSync(out, { recursive: true, force: true });
  }
});

test('archive versions render hostile stored fields as text and retain empty state', () => {
  const html = readFileSync(new URL('./days/2026-10-09/artifact-1.html', import.meta.url), 'utf8');
  const render = html.match(/function renderAsh\(\)\{[\s\S]*?\n\}/)[0];
  class Node {
    children = []; textContent = ''; className = '';
    constructor(tag) { this.tag = tag; }
    appendChild(node) { this.children.push(node); return node; }
    replaceChildren(node) { this.children = [node]; }
    set innerHTML(_) { assert.fail('untrusted fields must never reach an HTML sink'); }
  }
  const nodes = Object.fromEntries(['#ashline', '#ashsum', '#ashlist'].map((id) => [id, new Node(id)]));
  const attack = '<img src=x onerror=alert(1)>';
  const context = {
    S: { versions: [{ v: attack, done: attack, total: 4, change: attack, start: attack, target: attack,
      ms: [{ title: attack, due: attack, doneOn: '' }] }] },
    $: (id) => nodes[id], plural: (n, word) => `${n} ${word}`, valid: () => false,
    document: { createElement: (tag) => new Node(tag), createDocumentFragment: () => new Node('fragment') },
  };
  runInNewContext(`${render};renderAsh()`, context);
  const box = nodes['#ashlist'].children[0].children[0];
  assert.equal(box.className, 'ver');
  assert.equal(box.children[0].tag, 'h3');
  assert.ok(box.children[0].textContent.includes(attack));
  assert.equal(box.children[3].children[0].textContent, `${attack} · due ${attack}`);
  context.S.versions = [];
  runInNewContext('renderAsh()', context);
  assert.equal(nodes['#ashlist'].children[0].children[0].textContent, 'No earlier plans.');
});
