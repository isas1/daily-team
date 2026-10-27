#!/usr/bin/env node
// The weekly report: what changed in the repository, what the teams built, and how both moved
// against the week before. A script gathers every fact; one model call writes a short summary
// from those facts only, and a check rejects any number or name that is not in them. If the
// summary fails twice, the report is published without it.
//
// Usage: node report.mjs [--week YYYY-MM-DD] [--activity file.json] [--dry-run] [--facts-only]
// Env:   PROVIDER, CLAUDE_MODEL, OPENROUTER_API_KEY, MODEL   as for run.mjs
//        GITHUB_REPOSITORY                                  for commit links (default isas1/daily-team)
// --week is the Monday the week starts (default: this week). Writes reports/<week>.md and .json.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { completeChecked, conceptName, findBanned, parseTeam, planSections, prepareProvider, sections, taskName, today } from './run.mjs';
import { markdownCell as cell } from './security.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = () => process.env.GITHUB_REPOSITORY || 'isas1/daily-team';
// The summary is three short sections; 120 words each keeps it to one screen.
export const HEADINGS = ['This week', 'The teams', 'The repo'];
export const SECTION_WORDS = 120;
const MAX_TOKENS = 2000;

function die(msg) {
  console.error(`report.mjs: ${msg}`);
  process.exit(2);
}

// Dates are YYYY-MM-DD strings, handled in UTC so the result never depends on the machine.
const toDate = (s) => new Date(`${s}T00:00:00Z`);
const fmt = (d) => d.toISOString().slice(0, 10);
export const addDays = (s, n) => fmt(new Date(toDate(s).getTime() + n * 86_400_000));
export const mondayOf = (s) => addDays(s, -((toDate(s).getUTCDay() + 6) % 7));

export function checkWeek(week) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(week) || fmt(toDate(week)) !== week) return `not a date: ${week}`;
  if (mondayOf(week) !== week) return `not a Monday: ${week}`;
  return '';
}

// Which part of the project a file belongs to. First match wins.
const AREAS = [
  [/^(days\/|ARCHIVE\.md$)/, 'Records'],
  [/^\.github\//, 'Automation'],
  [/^(run\.mjs|prompt\.md)$/, 'Team and sessions'],
  [/^(publish\.mjs|card\.mjs|shot\.sh|brand\/)/, 'Pages and images'],
  [/^(recruit\.(mjs|sh)|github\.mjs|pools\/)/, 'Seasons and suggestions'],
  [/^(team\.sh|daily\.sh|brief\.md)$/, 'Team and sessions'],
  [/^(report\.mjs|reports\/)/, 'Weekly report'],
  [/^test\.mjs$/, 'Tests'],
  [/^(SKILL\.md|evals\/)/, 'Skill'],
  [/\.md$/, 'Docs'],
];
export const areaOf = (file) => AREAS.find(([re]) => re.test(file))?.[1] ?? 'Other';
// Files that travel with most changes. A commit takes its area from the other files when it has any.
const SUPPORTING = new Set(['Records', 'Docs', 'Tests', 'Other']);

export function commitArea(files) {
  const counts = new Map();
  for (const f of files) { const a = areaOf(f); counts.set(a, (counts.get(a) ?? 0) + 1); }
  const ranked = [...counts].sort((a, b) => b[1] - a[1]);
  return (ranked.find(([a]) => !SUPPORTING.has(a)) ?? ranked[0])?.[0] ?? 'Other';
}

const git = (root, args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });

export function testCount(root, before) {
  const sha = git(root, ['rev-list', '-1', `--before=${before} 00:00`, 'HEAD']).trim();
  if (!sha) return null;
  try {
    return (git(root, ['show', `${sha}:test.mjs`]).match(/^\s*test\(/gm) || []).length;
  } catch {
    return null;
  }
}

// Commits in the week, without the daily and weekly record commits and without author names.
export function weekChanges(root, week) {
  const out = git(root, ['log', '--no-merges', `--since=${week} 00:00`, `--until=${addDays(week, 7)} 00:00`,
    '--date=short', '--format=@@%h%x09%ad%x09%s', '--name-only']);
  const commits = [];
  for (const block of out.split('@@').slice(1)) {
    const [head, ...files] = block.trim().split('\n');
    const [sha, date, subject] = head.split('\t');
    if (/^(Daily team|Weekly report)\b/.test(subject)) continue;
    commits.push({ sha, date, subject, area: commitArea(files.filter(Boolean)) });
  }
  return commits.reverse();
}

export function weekDays(root, week) {
  const dir = join(root, 'days');
  if (!existsSync(dir)) return [];
  const end = addDays(week, 7);
  return readdirSync(dir).filter((d) => d >= week && d < end && existsSync(join(dir, d, 'day.json'))).sort().map((d) => {
    const day = JSON.parse(readFileSync(join(dir, d, 'day.json'), 'utf8'));
    const { members, constraint } = parseTeam(day.team || '');
    const parts = planSections(day.plan || '');
    const current = parts.Clash !== undefined;
    const guest = members.find((m) => m.guest);
    const temperaments = members.map((m) => m.temperament).filter(Boolean);
    const artifacts = (day.artifacts || []).map((a) => {
      const file = join(dir, d, a.file || '');
      return { file: a.file, lead: a.lead, status: a.status, problems: a.problems || [], bytes: a.file && existsSync(file) ? statSync(file).size : 0 };
    });
    return {
      date: day.date, status: day.status, task: taskName(day), concept: day.concept || conceptName(day.plan || '') || '',
      decision: day.decision || '', constraint, roles: members.filter((m) => !m.guest).map((m) => m.role),
      guest: guest ? { name: guest.role, kind: guest.guest.kind } : null, ...(temperaments.length ? { temperaments } : {}),
      format: current ? 'current' : 'old', deadlock: parts.Deadlock !== undefined, referee: Boolean(day.referee),
      clashLines: current ? [...parts.Clash.matchAll(/^\s*(?:[-*]\s+)?\*\*([^*\n]+?):?\*\*/gm)].length : null,
      planProblems: day.planProblems || [], artifacts,
    };
  });
}

// Seasons that start this week or next Monday, with what they add and retire.
export function weekSeasons(root, week) {
  const dir = join(root, 'pools');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).map((f) => f.slice(0, 10))
    .filter((s) => s === week || s === addDays(week, 7)).sort().map((start) => {
      const meta = JSON.parse(readFileSync(join(dir, `${start}.json`), 'utf8'));
      const list = (o) => Object.fromEntries(Object.entries(o || {}).map(([k, v]) => [k, v.map((i) => (typeof i === 'string' ? i : i.text))]));
      const counts = (o) => Object.fromEntries(Object.entries(o || {}).map(([k, v]) => [k, v.length]));
      // Counts are given so the summary never has to count a list itself.
      return {
        start, when: start === week ? 'started this week' : 'starts next Monday',
        addedCounts: counts(meta.added), retiredCounts: counts(meta.retired), added: list(meta.added), retired: list(meta.retired),
        accepted: (meta.suggestions || []).filter((s) => s.decision === 'accept').map((s) => ({ task: s.task, credit: s.credit ? s.author || '' : '' })),
      };
    });
}

const mean = (xs) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

export function metrics(facts) {
  const { days, changes } = facts;
  const current = days.filter((d) => d.format === 'current');
  const byArea = {};
  for (const c of changes.commits) byArea[c.area] = (byArea[c.area] ?? 0) + 1;
  const guestKinds = {};
  for (const d of days) if (d.guest) guestKinds[d.guest.kind] = (guestKinds[d.guest.kind] ?? 0) + 1;
  return {
    days: days.length, failed: days.filter((d) => d.status !== 'ok').length,
    flagged: days.filter((d) => d.planProblems.length || d.artifacts.some((a) => a.problems.length)).length,
    deadlocks: days.filter((d) => d.deadlock).length, refereed: days.filter((d) => d.referee).length,
    meanClashLines: mean(current.map((d) => d.clashLines)), artifacts: days.reduce((n, d) => n + d.artifacts.length, 0),
    meanArtifactKB: mean(days.flatMap((d) => d.artifacts.map((a) => Math.round(a.bytes / 1024)))),
    guestKinds, commits: changes.commits.length, commitsByArea: byArea, testsAtEnd: changes.testsAtEnd,
  };
}

// Differences from last week's numbers, for every number both weeks have.
export function trend(now, before) {
  if (!before) return null;
  const out = {};
  for (const [k, v] of Object.entries(now)) {
    if (typeof v === 'number' && typeof before[k] === 'number') out[k] = Math.round((v - before[k]) * 10) / 10;
  }
  return out;
}

export function weekFacts(root, week, activity = null) {
  const commits = weekChanges(root, week);
  const facts = {
    week: { start: week, end: addDays(week, 6) }, repository: REPO(),
    changes: { commits, testsAtStart: testCount(root, week), testsAtEnd: testCount(root, addDays(week, 7)) },
    days: weekDays(root, week), seasons: weekSeasons(root, week), github: activity,
  };
  facts.metrics = metrics(facts);
  const prev = join(root, 'reports', `${addDays(week, -7)}.json`);
  facts.trend = existsSync(prev) ? trend(facts.metrics, JSON.parse(readFileSync(prev, 'utf8')).facts?.metrics) : null;
  return facts;
}


// The full record, built from the facts alone. Always correct, so it is also the fallback.
export function renderTemplate(facts) {
  const { week, changes, days, seasons, github, metrics: m, trend: t } = facts;
  const delta = (k) => (t && typeof t[k] === 'number' && t[k] !== 0 ? ` (${t[k] > 0 ? '+' : ''}${t[k]} on last week)` : '');
  const out = [`## The record`, '', `Week of ${week.start} to ${week.end}.`, ''];
  out.push('### Summary', '',
    `- Days recorded: ${m.days}${delta('days')}. Failed: ${m.failed}. Flagged for review: ${m.flagged}.`,
    `- Changes to the repository: ${m.commits}${delta('commits')}.`,
    ...(m.testsAtEnd != null ? [`- Tests: ${changes.testsAtStart ?? 'none'} at the start of the week, ${m.testsAtEnd} at the end.`] : []), '');
  out.push('### What changed', '');
  if (!changes.commits.length) out.push('No changes this week.', '');
  else {
    const areas = [...new Set(changes.commits.map((c) => c.area))];
    for (const a of areas) {
      out.push(`**${a}**`, '');
      for (const c of changes.commits.filter((x) => x.area === a)) {
        out.push(`- ${c.date} [${c.sha}](https://github.com/${facts.repository}/commit/${c.sha}) ${c.subject}`);
      }
      out.push('');
    }
  }
  out.push('### What the teams built', '');
  if (!days.length) out.push('No days recorded this week.', '');
  else {
    out.push('| Date | Concept | Task | Team | Constraint | Pages |', '|---|---|---|---|---|---|');
    for (const d of days) {
      const team = [...d.roles, ...(d.guest ? [`${d.guest.name} (${d.guest.kind})`] : [])].join(' · ');
      const pages = d.artifacts.map((a) => `[${a.file}](../days/${d.date}/${a.file})`).join(' ') || d.status;
      out.push(`| [${d.date}](../days/${d.date}/) | ${cell(d.concept || '-')} | ${cell(d.task)} | ${cell(team)} | ${cell(d.constraint)} | ${pages} |`);
    }
    out.push('');
  }
  out.push('### How the teams worked', '',
    `- Sessions that ended in a deadlock: ${m.deadlocks}${delta('deadlocks')}. Settled by the referee: ${m.refereed}.`,
    ...(m.meanClashLines != null ? [`- Average clash length: ${m.meanClashLines} lines${delta('meanClashLines')}.`] : []),
    `- Pages built: ${m.artifacts}${delta('artifacts')}${m.meanArtifactKB != null ? `, ${m.meanArtifactKB} KB on average` : ''}.`,
    ...(Object.keys(m.guestKinds).length ? [`- Guests: ${Object.entries(m.guestKinds).map(([k, n]) => `${n} ${k}`).join(', ')}.`] : []), '');
  if (seasons.length) {
    out.push('### Seasons', '');
    for (const s of seasons) {
      const added = Object.entries(s.added).map(([k, v]) => `${v.length} ${k}`).join(', ');
      const retired = Object.entries(s.retired).map(([k, v]) => `${v.length} ${k}`).join(', ');
      out.push(`- Season ${s.start} ${s.when}. Added: ${added || 'none'}. Retired: ${retired || 'none'}.`);
      for (const a of s.accepted) out.push(`  - Suggestion accepted: ${a.task}${a.credit ? ` (suggested by @${a.credit})` : ''}`);
    }
    out.push('');
  }
  out.push('### On GitHub', '');
  if (!github) out.push('GitHub activity was not available for this report.', '');
  else {
    const list = (xs) => (xs.length ? xs.map((x) => `#${x.number} ${x.title}`).join('; ') : 'none');
    out.push(`- Issues opened: ${list(github.issuesOpened)}.`, `- Issues closed: ${list(github.issuesClosed)}.`,
      `- Pull requests merged: ${list(github.prsMerged)}.`,
      `- Task suggestions made this week: ${github.suggestionsOpenedThisWeekCount}. Still open now: ${github.openSuggestionsNow.length ? github.openSuggestionsNow.map((s) => `#${s.number} ${s.title} (${s.votes} votes)`).join('; ') : 'none'}.`, '');
  }
  return out.join('\n');
}

// Every string value in the facts, for checking names against.
const factText = (facts) => JSON.stringify(facts).toLowerCase();

const NUMBER_WORDS = /\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|dozen)\b/gi;

// The values a count of this kind can take in the facts.
function countsFor(facts, kind) {
  const out = new Set();
  if (kind === 'day') out.add(facts.metrics.days);
  else if (kind === 'commit') {
    out.add(facts.metrics.commits);
    for (const n of Object.values(facts.metrics.commitsByArea)) out.add(n);
  } else {
    for (const s of facts.seasons) for (const c of [s.addedCounts, s.retiredCounts]) if (c?.[`${kind}s`] != null) out.add(c[`${kind}s`]);
  }
  return out;
}

// Problems with the model's summary. Any number or highlighted name must come from the facts.
export function reportProblems(text, facts) {
  const problems = [];
  const all = factText(facts);
  const heads = [...text.matchAll(/^#{1,6}\s+(.+)$/gm)].map((m) => m[1].trim());
  if (heads.join('|') !== HEADINGS.join('|')) problems.push(`headings must be exactly: ${HEADINGS.join(', ')}`);
  for (const part of text.split(/^#{1,6}\s+.+$/m).slice(1)) {
    const words = part.split(/\s+/).filter(Boolean).length;
    if (words > SECTION_WORDS) problems.push(`a section has ${words} words, more than ${SECTION_WORDS}`);
  }
  const year = facts.week.start.slice(0, 4);
  const known = new Set((all.match(/\d+(?:\.\d+)?/g) || []).map(Number));
  for (const n of new Set(text.replace(/,(?=\d{3}\b)/g, '').match(/\d+(?:\.\d+)?/g) || [])) {
    if (Number(n) <= 10 || n === year) continue;
    if (!known.has(Number(n))) problems.push(`the number ${n} is not in the facts`);
  }
  // Numbers must be digits so they can be checked. "One" is left alone: it is too often not a count.
  for (const m of new Set((text.match(NUMBER_WORDS) || []).map((w) => w.toLowerCase()))) {
    problems.push(`write "${m}" as digits`);
  }
  // A count next to what it counts must match that count in the facts.
  for (const [, n, noun] of text.matchAll(/\b(\d+) (?:new )?(roles?|methods?|constraints?|tasks?|guests?|temperaments?|days?|commits?)\b/gi)) {
    const allowed = countsFor(facts, noun.toLowerCase().replace(/s$/, ''));
    if (allowed.size && !allowed.has(Number(n))) problems.push(`"${n} ${noun}" does not match the facts (${[...allowed].join(' or ')})`);
  }
  for (const m of text.matchAll(/\*\*([^*\n]+)\*\*|"([^"\n]+)"|“([^”\n]+)”/g)) {
    const name = (m[1] || m[2] || m[3]).trim().replace(/[.,:;]$/, '');
    if (!all.includes(name.toLowerCase())) problems.push(`"${name}" is not in the facts`);
  }
  if (/https?:\/\/|www\./i.test(text)) problems.push('contains a link');
  if (/!/.test(text)) problems.push('contains an exclamation mark');
  if (/\p{Extended_Pictographic}/u.test(text)) problems.push('contains an emoji');
  for (const w of findBanned(text)) problems.push(`uses the word "${w}"`);
  return problems;
}

export function reportMessages(facts) {
  const s = sections();
  return [
    { role: 'system', content: `${s['Weekly report']}\n\n## Writing rules\n\n${s['Writing rules']}` },
    { role: 'user', content: `Facts for the week of ${facts.week.start}:\n\n${JSON.stringify(facts, null, 1)}` },
  ];
}

const quiet = (facts) => !facts.days.length && !facts.changes.commits.length;

// Writes the summary with one retry. Returns the summary text, or '' with the problems if it failed.
export async function summarize(facts, complete) {
  if (quiet(facts)) return { text: '', model: '', status: 'ok', problems: [] };
  try {
    const out = await completeChecked(complete, reportMessages(facts), MAX_TOKENS, (t) => reportProblems(t.trim(), facts));
    if (out.problems.length) return { text: '', model: out.model, status: 'flagged', problems: out.problems };
    return { text: out.text.trim(), model: out.model, status: 'ok', problems: [] };
  } catch (e) {
    return { text: '', model: '', status: 'flagged', problems: [e.message.slice(0, 300)] };
  }
}

export function reportMarkdown(facts, summary) {
  const head = [`# Weekly report: ${facts.week.start} to ${facts.week.end}`, ''];
  if (summary.text) head.push(summary.text, '');
  else if (quiet(facts)) head.push('A quiet week: no days were recorded and nothing changed.', '');
  else head.push('The written summary did not pass its fact check this week, so only the record is shown.', '');
  return `${[...head, renderTemplate(facts)].join('\n').trim()}\n`;
}

export function indexMarkdown(dir) {
  const rows = readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().reverse().map((f) => {
    const r = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    const m = r.facts.metrics;
    return `| [${r.facts.week.start}](${r.facts.week.start}.md) | ${m.days} | ${m.artifacts} | ${m.commits} | ${r.status === 'ok' ? 'ok' : 'record only'} |`;
  });
  return ['# Weekly reports', '', 'One report per week, written each Sunday from the repository and the day records. Generated; do not edit by hand.', '',
    '| Week | Days | Pages | Changes | Summary |', '|---|---|---|---|---|', ...rows, ''].join('\n');
}

export function writeReport(root, facts, summary) {
  const dir = join(root, 'reports');
  mkdirSync(dir, { recursive: true });
  const record = { facts, model: summary.model, status: summary.status, problems: summary.problems };
  writeFileSync(join(dir, `${facts.week.start}.md`), reportMarkdown(facts, summary));
  writeFileSync(join(dir, `${facts.week.start}.json`), `${JSON.stringify(record, null, 2)}\n`);
  writeFileSync(join(dir, 'README.md'), indexMarkdown(dir));
}

function parseArgs(argv) {
  const opts = { week: mondayOf(today()), activity: '', dryRun: false, factsOnly: false, provider: process.env.PROVIDER || 'openrouter' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => (i + 1 < argv.length ? argv[++i] : die(`${a} needs a value`));
    if (a === '--week') opts.week = value();
    else if (a === '--activity') opts.activity = value();
    else if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--facts-only') opts.factsOnly = true;
    else die(`unknown argument ${a}`);
  }
  const bad = checkWeek(opts.week);
  if (bad) die(bad);
  if (!['openrouter', 'claude'].includes(opts.provider)) die('PROVIDER must be openrouter or claude');
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  let activity = null;
  if (opts.activity && existsSync(opts.activity)) {
    try { activity = JSON.parse(readFileSync(opts.activity, 'utf8')); } catch { activity = null; }
  }
  const facts = weekFacts(HERE, opts.week, activity);
  if (opts.factsOnly) return console.log(JSON.stringify(facts, null, 2));
  const summary = await summarize(facts, quiet(facts) ? null : prepareProvider(opts.provider));
  if (opts.dryRun) {
    console.log(reportMarkdown(facts, summary));
    console.error(`status: ${summary.status}${summary.problems.length ? `\n- ${summary.problems.join('\n- ')}` : ''}`);
    return;
  }
  writeReport(HERE, facts, summary);
  console.log(`reports/${opts.week}.md ${summary.status}${summary.problems.length ? `: ${summary.problems.join('; ')}` : ''}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => die(e.message));
}
