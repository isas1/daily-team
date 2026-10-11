#!/usr/bin/env node
// GitHub side of the weekly cycle. Uses only GITHUB_TOKEN, never a model credential.
//
// Usage: node github.mjs suggestions            open task suggestions as JSON, most votes first
//        node github.mjs close-loop <season.json> comment on and close each screened suggestion
//        node github.mjs announce <season.json>   post the season in Discussions, if enabled
//        node github.mjs activity <monday>        the week's issues, merged pull requests, and suggestions
// Env:   GITHUB_TOKEN, GITHUB_REPOSITORY (owner/repo), GITHUB_API_URL, GITHUB_GRAPHQL_URL
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const API = () => process.env.GITHUB_API_URL || 'https://api.github.com';
const GRAPHQL = () => process.env.GITHUB_GRAPHQL_URL || `${API()}/graphql`;
const REPO = () => process.env.GITHUB_REPOSITORY || 'isas1/daily-team';
export const LABEL = 'task-suggestion';
// A maintainer adds this label to keep a suggestion out of the README and the weekly screen.
export const HIDDEN = 'hidden';
const MAX_FIELD = 300;

async function gh(path, { method = 'GET', body } = {}) {
  const res = await fetch(path.startsWith('http') ? path : `${API()}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'daily-team',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${data.message || ''}`.trim());
  return data;
}

const plain = (s) => String(s ?? '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_FIELD);

// Reads the fields of the task-suggestion issue form from an issue body.
export function parseForm(body) {
  const fields = {};
  for (const part of String(body ?? '').split(/^### /m).slice(1)) {
    const nl = part.indexOf('\n');
    fields[part.slice(0, nl).trim().toLowerCase()] = part.slice(nl + 1).trim();
  }
  const field = (name) => {
    const v = fields[name] ?? '';
    return v === '_No response_' ? '' : v;
  };
  const ticked = (name) => /- \[x\]/i.test(field(name));
  return {
    // Older issues use the first label; the spark form from season 3 uses the second.
    task: plain(field('task')), helps: plain(field('who it helps') || field('who it is for')),
    check: plain(field('how you would know it works') || field('what you hope to see')),
    credit: ticked('credit'), license: ticked('license'),
  };
}

export async function fetchSuggestions() {
  const out = [];
  for (let page = 1; page <= 5; page++) {
    const issues = await gh(`/repos/${REPO()}/issues?state=open&labels=${LABEL}&per_page=100&page=${page}`);
    for (const i of issues) {
      if (i.pull_request || i.labels?.some((l) => (l.name ?? l) === HIDDEN)) continue;
      out.push({ number: i.number, author: i.user.login, votes: i.reactions?.['+1'] ?? 0, url: i.html_url, title: plain(i.title), ...parseForm(i.body) });
    }
    if (issues.length < 100) break;
  }
  return out.sort((a, b) => b.votes - a.votes || a.number - b.number);
}

// Issues opened and closed, pull requests merged, and open suggestions, for the weekly report.
// since and until are YYYY-MM-DD; until is exclusive.
export async function activity(since, until) {
  const inWeek = (t) => Boolean(t) && t.slice(0, 10) >= since && t.slice(0, 10) < until;
  const brief = (i) => ({ number: i.number, title: plain(i.title).slice(0, 120) });
  const issues = [];
  for (let page = 1; page <= 5; page++) {
    const batch = await gh(`/repos/${REPO()}/issues?state=all&since=${since}T00:00:00Z&per_page=100&page=${page}`);
    issues.push(...batch.filter((i) => !i.pull_request));
    if (batch.length < 100) break;
  }
  const pulls = await gh(`/repos/${REPO()}/pulls?state=closed&sort=updated&direction=desc&per_page=100`);
  const open = await fetchSuggestions();
  const opened = issues.filter((i) => inWeek(i.created_at));
  const closed = issues.filter((i) => inWeek(i.closed_at));
  const suggestion = (i) => i.labels?.some((l) => (l.name ?? l) === LABEL);
  return {
    suggestionsOpenedThisWeekCount: opened.filter(suggestion).length,
    issuesOpenedCount: opened.length,
    issuesClosedCount: closed.length,
    issuesOpenedAndClosedCount: opened.filter((i) => inWeek(i.closed_at)).length,
    issuesOpened: opened.map(brief),
    issuesClosed: closed.map(brief),
    prsMerged: pulls.filter((p) => inWeek(p.merged_at)).map(brief),
    // Suggestions still open when the report runs, not those made this week.
    openSuggestionsNow: open.slice(0, 5).map((s) => ({ number: s.number, title: s.title.slice(0, 120), votes: s.votes })),
  };
}

const addWeek = (s) => new Date(Date.parse(`${s}T00:00:00Z`) + 7 * 86_400_000).toISOString().slice(0, 10);

export function commentFor(s, start) {
  if (s.decision === 'accept') {
    return [
      `Accepted for the season starting ${start}, as:`, '', `> ${s.task}`, '',
      `It runs on a date drawn from the new task pool${s.credit ? ', and that day credits you' : ''}. Thank you.`,
    ].join('\n');
  }
  return `Not added: ${s.reason}\n\nYou are welcome to open a new suggestion with changes.`;
}

export async function closeLoop(meta) {
  for (const s of meta.suggestions) {
    const issue = await gh(`/repos/${REPO()}/issues/${s.issue}`);
    if (issue.state !== 'open') continue;
    await gh(`/repos/${REPO()}/issues/${s.issue}/comments`, { method: 'POST', body: { body: commentFor(s, meta.start) } });
    await gh(`/repos/${REPO()}/issues/${s.issue}`, {
      method: 'PATCH', body: { state: 'closed', state_reason: s.decision === 'accept' ? 'completed' : 'not_planned' },
    });
    console.log(`#${s.issue}: ${s.decision}`);
  }
}

export function announcement(meta) {
  const list = (items) => items.map((i) => `- ${i.text}${i.credit ? ` (suggested by ${i.credit})` : ''}`).join('\n');
  return [
    `New members join the daily team on ${meta.start}.`, '',
    '**Roles**', list(meta.added.roles), '',
    '**Methods**', list(meta.added.methods), '',
    '**Tasks**', list(meta.added.tasks), '',
    `Suggest a task: https://github.com/${REPO()}/issues/new?template=task-suggestion.yml`,
    `Vote with a thumbs-up on open suggestions: https://github.com/${REPO()}/issues?q=is%3Aissue+is%3Aopen+label%3A${LABEL}+sort%3Areactions-%2B1-desc`,
  ].join('\n');
}

export async function announce(meta) {
  const [owner, name] = REPO().split('/');
  const query = async (q, variables) => {
    const r = await gh(GRAPHQL(), { method: 'POST', body: { query: q, variables } });
    if (r.errors) throw new Error(r.errors.map((e) => e.message).join('; '));
    return r.data;
  };
  const data = await query('query($owner:String!,$name:String!){repository(owner:$owner,name:$name){id hasDiscussionsEnabled discussionCategories(first:25){nodes{id name}}}}', { owner, name });
  const repo = data.repository;
  const category = repo.discussionCategories.nodes.find((c) => c.name === 'Announcements');
  if (!repo.hasDiscussionsEnabled || !category) {
    console.log('Discussions or the Announcements category is not enabled; skipping the announcement.');
    return;
  }
  await query('mutation($r:ID!,$c:ID!,$t:String!,$b:String!){createDiscussion(input:{repositoryId:$r,categoryId:$c,title:$t,body:$b}){discussion{url}}}',
    { r: repo.id, c: category.id, t: `Season ${meta.start}: who joined`, b: announcement(meta) });
  console.log('announced');
}

async function main() {
  const [cmd, file] = process.argv.slice(2);
  if (!process.env.GITHUB_TOKEN) throw new Error('GITHUB_TOKEN is not set');
  if (cmd === 'suggestions') process.stdout.write(`${JSON.stringify(await fetchSuggestions(), null, 2)}\n`);
  else if (cmd === 'close-loop') await closeLoop(JSON.parse(readFileSync(file, 'utf8')));
  else if (cmd === 'announce') await announce(JSON.parse(readFileSync(file, 'utf8')));
  else if (cmd === 'activity' && /^\d{4}-\d{2}-\d{2}$/.test(file ?? '')) {
    process.stdout.write(`${JSON.stringify(await activity(file, addWeek(file)), null, 2)}\n`);
  } else throw new Error('usage: node github.mjs suggestions | close-loop <season.json> | announce <season.json> | activity <monday>');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(`github.mjs: ${e.message}`); process.exit(1); });
}
