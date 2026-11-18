// Text-only model adapters. Libraries throw; CLI entry points choose exit codes.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { redactCredentials } from './security.mjs';

export const DEFAULT_CLAUDE_MODEL = 'claude-opus-5-5';

export async function completeOpenRouter(messages, maxTokens) {
  // Resolve runtime config at call time, not when another tool imports this module.
  const apiUrl = process.env.API_URL || 'https://openrouter.ai/api/v1/chat/completions';
  const models = (process.env.MODEL || 'openrouter/free,qwen/qwen3.8-27b:free,google/gemma-4-31b-it:free')
    .split(',').map((m) => m.trim()).filter(Boolean);
  const errors = [];
  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            'X-Title': 'daily-team',
          },
          body: JSON.stringify({ model, messages, max_tokens: maxTokens }),
          signal: AbortSignal.timeout(300_000),
        });
        const body = await res.json().catch(() => ({}));
        const text = body.choices?.[0]?.message?.content;
        if (res.ok && text?.trim()) return { text, model: body.model || model };
        errors.push(`${model}: ${res.status} ${body.error?.message || 'empty response'}`);
        if (res.status !== 429 || attempt === 1) break;
        await new Promise((r) => setTimeout(r, Number(process.env.RETRY_MS ?? 10_000)));
      } catch (e) {
        errors.push(`${model}: ${e.message}`);
        break;
      }
    }
  }
  throw new Error(redactCredentials(`all models failed: ${errors.join('; ')}`));
}

// Claude Code in print mode, on the user's subscription. No tools, no MCP servers, no user
// settings or hooks, no CLAUDE.md, and an empty working directory: it can only return text.
export function claudeArgs(system, model = process.env.CLAUDE_MODEL || DEFAULT_CLAUDE_MODEL) {
  const args = ['-p', '--output-format', 'json', '--tools', '', '--strict-mcp-config',
    '--setting-sources', 'project', '--no-session-persistence', '--system-prompt', system];
  args.push('--model', model);
  return args;
}

export function completeClaude(messages, _maxTokens, model = process.env.CLAUDE_MODEL || DEFAULT_CLAUDE_MODEL) {
  const prompt = messages.slice(1).map((m) => (m.role === 'assistant'
    ? `<your_previous_answer>\n${m.content}\n</your_previous_answer>` : m.content)).join('\n\n');
  const cwd = mkdtempSync(join(tmpdir(), 'daily-team-claude-'));
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.CLAUDE_BIN || 'claude', claudeArgs(messages[0].content, model), {
      cwd, env: { ...process.env, CLAUDE_CODE_DISABLE_CLAUDE_MDS: '1' }, timeout: 900_000,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c) => { stdout += c; });
    child.stderr.on('data', (c) => { stderr += c; });
    child.on('error', reject);
    child.on('close', (code) => {
      rmSync(cwd, { recursive: true, force: true });
      let body;
      try {
        body = JSON.parse(stdout);
      } catch {
        return reject(new Error(`claude exited ${code}: ${redactCredentials(stderr || stdout).trim().slice(0, 300)}`));
      }
      if (code !== 0 || body.is_error || !body.result?.trim()) {
        return reject(new Error(`claude: ${redactCredentials(body.result || stderr || `exit ${code}`).slice(0, 300)}`));
      }
      const actualModel = Object.keys(body.modelUsage || {})[0] || model;
      resolve({ text: body.result, model: actualModel, costUsd: Number(body.total_cost_usd) || 0 });
    });
    child.stdin.end(prompt);
  });
}

// Keep configuration errors catchable by library callers and distinguishable by CLIs.
const configurationError = (message) => Object.assign(new Error(message), { exitCode: 2 });

// Checks the credential for a provider without ever printing it, and returns its complete().
export function prepareProvider(provider) {
  if (!['openrouter', 'claude'].includes(provider)) throw configurationError('provider must be openrouter or claude');
  if (provider === 'openrouter') {
    const key = (process.env.OPENROUTER_API_KEY || '').trim();
    if (!key) throw configurationError('OPENROUTER_API_KEY is not set');
    if (!process.env.API_URL && !key.startsWith('sk-or-')) {
      throw configurationError('OPENROUTER_API_KEY does not look like an OpenRouter key: expected it to start with "sk-or-"');
    }
    process.env.OPENROUTER_API_KEY = key;
    return completeOpenRouter;
  }
  if (process.env.CLAUDE_CODE_OAUTH_TOKEN !== undefined) {
    const token = process.env.CLAUDE_CODE_OAUTH_TOKEN.trim();
    if (!token) delete process.env.CLAUDE_CODE_OAUTH_TOKEN; // use the local login
    else if (!token.startsWith('sk-ant-oat')) {
      throw configurationError('CLAUDE_CODE_OAUTH_TOKEN does not look like a token from claude setup-token: expected it to start with "sk-ant-oat"');
    } else process.env.CLAUDE_CODE_OAUTH_TOKEN = token;
  }
  return completeClaude;
}

// One call, then one more with the problems listed if the result fails its check.
export async function completeChecked(complete, messages, maxTokens, check) {
  let out = await complete(messages, maxTokens);
  let problems = check(out.text);
  if (problems.length) {
    const retry = [...messages, { role: 'assistant', content: out.text },
      { role: 'user', content: `Fix these problems and return the full result again:\n- ${problems.join('\n- ')}` }];
    out = await complete(retry, maxTokens);
    problems = check(out.text);
  }
  return { ...out, problems };
}
