#!/usr/bin/env node
// Turns the records in days/ into pages:
//   days/<date>/team.png    the branded team card (rendered once, or again with --cards)
//   days/<date>/README.md   the day page GitHub shows when the folder is opened
//   ARCHIVE.md              every day, newest first
//   README.md               the Today, Week (season and vote), and Recent blocks
//   --site <dir>            a static site where artifacts run only in sandboxed frames
//
// Usage: node publish.mjs [--site dir] [--root dir] [--suggestions file.json] [--cards]
// Env:   PAGES_URL          site link to show in the README
//        GITHUB_REPOSITORY  owner/repo, for links from the site back to the repo
import { constants, copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dayTitle, parseTeam, planSections, teamFor, today } from './team-session.mjs';
import { findBanned } from './prompt-rules.mjs';
import { listSeasons, readSeason } from './recruit.mjs';
import { cardHtml, renderPng, titleCase } from './card.mjs';
import { hasCover } from './cover.mjs';
import { assertPackExport } from './component-pack.mjs';
import { assertProjectExport } from './project-planning.mjs';
import { ARTIFACT_SANDBOX } from './artifact-policy.mjs';
import { markdownCell as cell } from './security.mjs';

import { hasSim, highlights, watchHtml, WATCH_FILE } from './sim-view.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const RECENT_DAYS = 7;
const MIN_SCREENSHOT_BYTES = 8000;
// Clone blocks on filesystems that support it. Node falls back to a byte copy.
const SITE_COPY_MODE = constants.COPYFILE_FICLONE;
const SITE_CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'self' 'unsafe-inline'; "
  + "img-src 'self' data: blob:; media-src data: blob:; font-src 'self' data:; form-action 'none'";

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const title = dayTitle;
const memberRoles = (members) => members.map((m) => m.role).join(' · ');
const roles = (day) => memberRoles(parseTeam(day.team).members);
// A component day's piece is its headline asset; otherwise the first that worked.
const firstAsset = (day) => day.artifacts.find((a) => a.kind === 'piece' && a.status !== 'failed')
  ?? day.artifacts.find((a) => a.status !== 'failed');
const png = (a) => a.file.replace(/\.html$/, '.png');
// Only a rendered cover matching this exact day record may replace its screenshot.
const preview = (day, daysDir) => hasCover(day, daysDir) ? 'cover.png'
  : firstAsset(day) ? png(firstAsset(day)) : '';

export function loadDays(daysDir) {
  if (!existsSync(daysDir)) return [];
  return readdirSync(daysDir)
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && existsSync(join(daysDir, d, 'day.json')))
    .sort()
    .map((d) => JSON.parse(readFileSync(join(daysDir, d, 'day.json'), 'utf8')));
}

function assetLines(day, dir, pagesUrl, members) {
  if (day.status === 'failed' && !day.plan) return [`No asset. The team could not run: ${day.error}`];
  const lines = [];
  for (const a of day.artifacts) {
    const lead = members[a.lead - 1]?.role ?? `member ${a.lead}`;
    if (a.status === 'failed') { lines.push(`${a.file}: no asset. ${a.problems.join('; ')}`, ''); continue; }
    if (existsSync(join(dir, png(a)))) lines.push(`<a href="${a.file}"><img src="${png(a)}" alt="Screenshot of ${esc(a.file)}" width="100%"></a>`, '');
    const use = pagesUrl ? `[Use it](${pagesUrl}${day.date}/) · ` : '';
    const note = a.status === 'ok' ? '' : ` Needs review: ${a.problems.join('; ')}.`;
    lines.push(`${use}[${a.file}](${a.file}), led by ${lead}. Model: ${a.model}.${note}`, '');
  }
  return lines.length ? lines : ['No asset was requested for this day.'];
}

// The team session in parts, with speakers matched to member numbers. Null for days recorded
// before the Pitch and Clash format; those keep their plan as plain markdown.
export function session(day, team) {
  const parts = day.plan ? planSections(day.plan) : {};
  if (parts.Pitch === undefined || parts.Clash === undefined) return null;
  const { members } = team ?? parseTeam(day.team);
  const num = (who) => (members.findIndex((m) => m.role.toLowerCase() === who.toLowerCase()) + 1) || null;
  const pitches = [];
  for (const l of lines(parts.Pitch)) {
    const head = l.match(/^\*\*(.+?)\*\*$/);
    if (head) {
      const [who, ...rest] = head[1].split(/\s*:\s+|\s+[—–-]\s+/);
      pitches.push({ who: who.trim(), num: num(who.trim()), concept: rest.join(' ').trim(), lines: [] });
    } else if (pitches.length) pitches.at(-1).lines.push(l);
  }
  const clash = lines(parts.Clash).map((l) => {
    const m = l.match(/^(?:[-*]\s+)?\*\*([^*\n]+?):?\*\*:?\s*(.*)$/);
    return m ? { who: m[1].trim(), num: num(m[1].trim()), text: m[2] } : { who: '', num: null, text: l };
  });
  return { pitches, clash, deadlock: parts.Deadlock, referee: parts.Referee, decision: parts.Decision, notes: parts['Build notes'] };
}

const lines = (text) => String(text ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
const label = (x) => `${x.num ? `${x.num} · ` : ''}${x.who}`;

function sessionMarkdown(s) {
  const out = ['## The session', '', '### Pitch', ''];
  for (const p of s.pitches) out.push(`**${label(p)}${p.concept ? `: ${p.concept}` : ''}**\\`, p.lines.join('\\\n'), '');
  out.push('### Clash', '');
  for (const c of s.clash) out.push(c.who ? `**${label(c)}:** ${c.text}` : c.text, '');
  if (s.deadlock !== undefined) out.push('### Deadlock', '', s.deadlock, '');
  if (s.referee !== undefined) out.push('### Referee', '', ...lines(s.referee).map((l) => `> ${l}\n>`), '');
  if (s.decision !== undefined) out.push('### Decision', '', s.decision, '');
  if (s.notes !== undefined) out.push('### Build notes', '', s.notes, '');
  return out;
}

const inline = (s) => esc(s).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/`([^`]+)`/g, '<code>$1</code>');
function blockHtml(text) {
  const out = [];
  let list = null;
  for (const l of lines(text)) {
    const item = l.match(/^(?:[-*]|\d+\.)\s+(.*)$/);
    if (item) {
      if (!list) out.push(list = []);
      list.push(item[1]);
    } else {
      list = null;
      out.push(l);
    }
  }
  return out.map((x) => (Array.isArray(x) ? `<ul>${x.map((i) => `<li>${inline(i)}</li>`).join('')}</ul>` : `<p>${inline(x)}</p>`)).join('\n');
}

function sessionHtml(s) {
  const who = (x) => `<span class="who">${x.num ? `<span class="num">${x.num}</span>` : ''}${esc(x.who)}</span>`;
  return [
    '<h2>The session</h2>', '<h3>Pitch</h3>', '<div class="pitches">',
    ...s.pitches.map((p) => `<div class="pitch">${who(p)}${p.concept ? `<div class="concept">${esc(p.concept)}</div>` : ''}${p.lines.map((l) => `<p>${inline(l)}</p>`).join('')}</div>`),
    '</div>', '<h3>Clash</h3>', '<ol class="clash">',
    ...s.clash.map((c) => `<li>${c.who ? who(c) : ''}<span>${inline(c.text)}</span></li>`),
    '</ol>',
    s.deadlock !== undefined ? `<h3>Deadlock</h3>\n${blockHtml(s.deadlock)}` : '',
    s.referee !== undefined ? `<aside class="referee"><h3>Referee</h3>\n${blockHtml(s.referee)}</aside>` : '',
    s.decision !== undefined ? `<h3>Decision</h3>\n${blockHtml(s.decision)}` : '',
    s.notes !== undefined ? `<h3>Build notes</h3>\n${blockHtml(s.notes)}` : '',
  ].filter(Boolean).join('\n');
}

// Guests bring a method drawn from a figure, myth, book, or idea. Historical guests never speak as
// the person; others speak in character in original words. Days recorded before the Pitch and
// Clash format keep the stricter note.
function guestNote(members, transcript) {
  const g = members.find((m) => m.guest);
  if (!g) return [];
  const voice = g.guest.kind === 'historical' || !transcript
    ? 'The guest never speaks as the figure'
    : 'The guest speaks in character in original words, never quoting the source';
  return [`**Guest:** ${g.role} (${g.guest.kind}; ${g.guest.source}). The method is drawn from public-domain history, myth, or literature, or invented. ${voice}, and nothing here is endorsed by anyone.`, ''];
}

function readPlanningInput(dir) {
  try { return JSON.parse(readFileSync(join(dir, 'planning-input.json'), 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}

// Fetch success and actual influence are separate facts, both visible in the receipt.
export function feedEvidence(day, daysDir) {
  return formatFeedEvidence(day, readPlanningInput(join(daysDir, day.date)));
}

function formatFeedEvidence(day, input) {
  if (input === undefined) return [];
  const selected = new Set(day.planning?.selectedSourceIds || []);
  const solution = input.solutionVersion === 1;
  return [
    ...(input.sources || []).map(s => `${s.source}: ${s.status}${s.count !== undefined ? ` (${s.count} items)` : ''}${s.reason ? ` — ${s.reason}` : ''}`),
    ...(input.candidates || []).filter(c => selected.has(c.id)).map(c =>
      `${solution ? 'Problem source' : 'Used feed inspiration'}: ${c.title} — ${c.url}`),
    ...(selected.size || solution ? [] : ['No feed article recorded as used; fetched items may have been considered without selection.']),
    ...(day.planning?.selection ? [`Chosen opportunity: ${day.planning.selection.id}. ${day.planning.selection.rationale}`] : []),
  ];
}

export function dayReadme(day, daysDir, pagesUrl) {
  return renderDayReadme(day, pagesUrl, readDay(day, daysDir));
}

function solutionDetails(day, input) {
  if (input?.solutionVersion !== 1 || day.status === 'failed' || !day.project) return null;
  const verified = day.artifacts.find(a => a.solutionCheck)?.solutionCheck;
  const source = input.candidates.find(c => c.id === day.project.sourceIds[0]);
  return { problem: day.project.problem, improvement: day.project.proof.improvement,
    verification: verified?.quality ? 'Browser passed both inputs, error feedback and recovery. Phone fit and keyboard replay passed.'
      : verified ? 'Browser passed both inputs, error feedback and recovery.' : 'Plan saved. Browser test pending.',
    source };
}

// Use the input that passed validation for every representation of this day.
function readDay(day, daysDir) {
  const dir = join(daysDir, day.date);
  const packInput = assertPackExport(day, dir);
  const projectInput = assertProjectExport(day, dir);
  const evidence = formatFeedEvidence(day, projectInput ?? packInput ?? readPlanningInput(dir));
  const team = parseTeam(day.team);
  return { dir, evidence, team, solution: solutionDetails(day, projectInput), solutionError: projectInput?.solutionVersion === 1 ? day.error : null,
    transcript: session(day, team), cover: hasCover(day, daysDir) };
}

function readDays(days, daysDir) {
  return new Map(days.map((day) => [day, readDay(day, daysDir)]));
}

function writeMarkdown(file, text) {
  let current;
  try { current = readFileSync(file, 'utf8'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (current !== text) writeFileSync(file, text);
}

function renderDayReadme(day, pagesUrl, { dir, cover, evidence, team, transcript, solution, solutionError }) {
  const { constraint, season, suggestedBy, members } = team;
  return [
    `# ${day.date}: ${title(day)}`, '',
    '[Today](../../README.md) · [Archive](../../ARCHIVE.md)', '',
    `<img src="team.png" alt="Team for ${day.date}: ${esc(memberRoles(members))}" width="100%">`, '',
    `**Task:** ${day.brief || day.task}`, '',
    ...(solution ? [`**Problem:** ${cell(solution.problem)}`, '', `**Improvement:** ${cell(solution.improvement)}`, '', `**Check:** ${solution.verification}`, ''] : []),
    ...(solutionError ? [`**Run result:** ${cell(solutionError)}`, ''] : []),
    ...(day.request ? [`**Request source:** [${cell(day.request.repository)} #${Number(day.request.number)}](https://github.com/${encodeURI(day.request.repository)}/issues/${Number(day.request.number)}). Local prototype; source issue stays open.`, ''] : []),
    ...(suggestedBy ? [`**Suggested by:** ${suggestedBy}`, ''] : []),
    `**Constraint:** ${constraint}`, '',
    ...(season ? [`**Season:** ${season}`, ''] : []),
    ...(day.decision ? [`**Decision:** ${day.decision}`, ''] : []),
    ...(cover ? [`<img src="cover.png" alt="Designed cover for ${esc(title(day))}" width="100%">`, '', '[Cover art direction](cover.json) · [Cover source](cover.html)', ''] : []),
    ...(evidence.length ? ['## Feed evidence', '', ...evidence.map(line => `- ${cell(line)}`), '', '[Saved planning input](planning-input.json)', ''] : []),
    '## Asset', '',
    ...(day.pack ? ['[Pack manifest](pack.json) · [Shared tokens](tokens.json) · [Planning input](planning-input.json)', '',
      'Generated candidates require human review. Library acceptance: unreviewed.', ''] : []),
    ...(existsSync(join(dir, 'comparison.html')) ? [
      '[Compare Opus, Sonnet, and Haiku](comparison.html)', '',
      ...(existsSync(join(dir, 'comparison.mp4')) ? ['[Watch square comparison video](comparison.mp4)', ''] : []),
    ] : []),
    ...assetLines(day, dir, pagesUrl, members),
    ...studioMarkdown(day, dir, pagesUrl),
    ...(transcript ? sessionMarkdown(transcript)
      : day.plan ? ['## Team plan', '', day.plan.replace(/^(#{1,5}) /gm, '#$1 '), ''] : []),
    ...guestNote(members, transcript),
    '## Team', '', '```text', day.team, '```', '',
    `Provider: ${day.provider}. Model: ${day.model ?? 'none'}.`, '',
  ].join('\n');
}

// The studio sim, when the day ran one: a link to the replay and the turning points as text.
function studioMarkdown(day, dir, pagesUrl) {
  if (!hasSim(day, dir)) return [];
  const h = highlights(day, dir);
  return [
    '## The studio', '',
    ...(pagesUrl ? [`[Watch the day](${pagesUrl}${day.date}/${WATCH_FILE}): the team as four agents in an animated studio.`, ''] : []),
    ...(h.beats.length ? ['Turning points:', '', ...h.beats.map((b) => `- ${b}`), ''] : []),
    ...(h.members.length ? [...h.members.map((m) => `- ${m}`), ''] : []),
    ...(h.interviews.length ? ['After the day:', '', ...h.interviews.map((x) => `- ${x}`), ''] : []),
  ];
}

function studioHtml(day, dir, imagePrefix) {
  if (!hasSim(day, dir)) return '';
  const h = highlights(day, dir);
  return `<h2>The studio</h2>\n<p><a href="${imagePrefix}${WATCH_FILE}">Watch the day</a>: the team as four agents in an animated studio.</p>`
    + (h.beats.length ? `\n<ul>${h.beats.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>` : '');
}

export function todayBlock(day, daysDir, pagesUrl) {
  if (!day) {
    const team = teamFor(today());
    return [`### ${today()}: ${parseTeam(team).task.split(':')[0]}`, '', 'The first daily run adds the team card and the asset here.', '', '```text', team, '```'].join('\n');
  }
  const base = `days/${day.date}/`;
  const a = firstAsset(day);
  const image = preview(day, daysDir);
  const shot = image && join(daysDir, day.date, image);
  const lines = [
    `### ${day.date}: ${title(day)}`, '',
    `<a href="${base}"><img src="${base}team.png" alt="Team for ${day.date}: ${esc(roles(day))}" width="100%"></a>`, '',
    `**Task:** ${day.brief || day.task}`, '',
    ...(day.decision ? [`**Decision:** ${day.decision}`, ''] : []),
  ];
  if (shot && existsSync(shot)) {
    lines.push(`<a href="${base}"><img src="${base}${image}" alt="${image === 'cover.png' ? `Designed cover for ${esc(title(day))}` : "Screenshot of today's asset"}" width="100%"></a>`, '');
    if (statSync(shot).size < MIN_SCREENSHOT_BYTES) lines.push('The screenshot may be blank. Open the day to check.', '');
  } else if (!a) lines.push(day.error ? `No asset today. ${day.error}` : 'No asset today.', '');
  const links = [`[Open the day](${base})`];
  if (pagesUrl && a) links.push(`[Use it](${pagesUrl}${day.date}/)`);
  if (pagesUrl && hasSim(day, join(daysDir, day.date))) links.push(`[Watch the day](${pagesUrl}${day.date}/${WATCH_FILE})`);
  links.push('[Archive](ARCHIVE.md)');
  lines.push(links.join(' · '));
  return lines.join('\n');
}

export function recentBlock(days, daysDir = join(HERE, 'days')) {
  if (!days.length) return 'The archive starts with the first daily run.';
  const rows = [...days].reverse().slice(0, RECENT_DAYS).map((d) => {
    const image = preview(d, daysDir);
    const thumb = image ? `<a href="days/${d.date}/"><img src="days/${d.date}/${image}" alt="${esc(title(d))}" width="160"></a>` : 'No asset';
    return `| [${d.date}](days/${d.date}/) | ${thumb} | ${cell(title(d))} | ${cell(roles(d))} |`;
  });
  return ['| Date | Asset | Task | Team |', '|---|---|---|---|', ...rows, '', `[All ${plural(days.length, 'day')}](ARCHIVE.md)`].join('\n');
}

export function archive(days, daysDir = join(HERE, 'days')) {
  return renderArchive(days, (day) => hasCover(day, daysDir));
}

function renderArchive(days, coverExists) {
  const rows = [...days].reverse().map((d) => {
    const a = firstAsset(d);
    const asset = a ? `[${a.status === 'ok' ? 'asset' : 'asset, needs review'}](days/${d.date}/${a.file})` : 'no asset';
    const cover = coverExists(d) ? `<a href="days/${d.date}/"><img src="days/${d.date}/cover.png" alt="${esc(title(d))}" width="160"></a> ` : '';
    return `| [${d.date}](days/${d.date}/) | ${cell(title(d))} | ${cover}${asset} |`;
  });
  return [
    '# Archive', '', `Every daily team and the asset it made, newest first. ${plural(days.length, 'day')} recorded.`, '',
    '[Today](README.md)', '',
    '| Date | Project | Open |', '|---|---|---|', ...rows, '',
  ].join('\n');
}

const REPO = () => process.env.GITHUB_REPOSITORY || 'isas1/daily-team';
// Visitor text reaches the README unreviewed, so only licensed suggestions with no links, handles,
// or banned words are listed. A maintainer hides any other one with the "hidden" label.
export const listable = (x) => Boolean(x.task?.trim()) && x.license === true
  && !/https?:|www\.|\b[a-z0-9-]+\.[a-z]{2,}\b|@/i.test(x.task) && !findBanned(x.task).length;

const userText = (s, max = 100) => {
  const t = String(s ?? '').replace(/[<>[\]()|*_`#!\\]/g, '').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 3)}...` : t;
};

// Who joined this season, short enough for the README: new roles by name, and a pool that is
// entirely new (the first guests or temperaments) as a count instead of every name.
export function newcomers(pools) {
  const names = (items) => items.filter((i) => i.fresh).map((i) => i.text);
  const guests = names(pools.guests ?? []).map((t) => t.split(' | ')[1]);
  const moods = names(pools.temperaments ?? []);
  const out = names(pools.roles);
  if (guests.length) out.push(guests.length === pools.guests.length ? `the first ${guests.length} guests` : guests.join(', '));
  if (moods.length) out.push(moods.length === pools.temperaments.length ? `${moods.length} temperaments` : `${moods.length} new temperaments`);
  return out;
}

// This week's season and the suggestion vote.
export function weekBlock(root, days, suggestions) {
  const seasons = listSeasons(root);
  const season = (days.length ? parseTeam(days.at(-1).team).season : '') || parseTeam(teamFor(today())).season;
  const lines = [];
  if (season && seasons.includes(season)) {
    const pools = readSeason(root, season);
    const fresh = newcomers(pools);
    lines.push(`**Season ${seasons.indexOf(season) + 1}**, since ${season}. ${fresh.length
      ? `New this season: ${new Intl.ListFormat('en', { type: 'conjunction' }).format(fresh)}.` : 'The first season, so everyone is new.'} A new season is drafted every Monday; from 2026-10-26 it replaces 16 roles and 16 methods.`, '');
  }
  const repo = REPO();
  lines.push('### Vote on what gets built next', '',
    `[Suggest a task](https://github.com/${repo}/issues/new?template=task-suggestion.yml) or vote with a thumbs-up on [open suggestions](https://github.com/${repo}/issues?q=is%3Aissue+is%3Aopen+label%3Atask-suggestion+sort%3Areactions-%2B1-desc). The most voted are screened every Monday.`, '');
  const top = (suggestions || []).filter(listable).slice(0, 5);
  if (top.length) {
    lines.push('| Votes | Suggestion |', '|---|---|',
      ...top.map((x) => `| ${Number(x.votes) || 0} | [${userText(x.task)}](https://github.com/${repo}/issues/${Number(x.number)}) |`));
  } else lines.push('No open suggestions yet.');
  return lines.join('\n');
}

export function replaceBlock(text, name, block) {
  const start = `<!-- ${name}:START -->`;
  const end = `<!-- ${name}:END -->`;
  const a = text.indexOf(start);
  const b = text.indexOf(end);
  if (a < 0 || b < a) throw new Error(`README has no ${start} ... ${end} block`);
  return `${text.slice(0, a + start.length)}\n${block}\n${text.slice(b)}`;
}

function page(heading, body, { root = './', image = '' } = {}) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${SITE_CSP}">
<title>${esc(heading)}</title>
<meta property="og:title" content="${esc(heading)}">
<meta property="og:description" content="A new creative team every day, and the web tool it built.">${image ? `
<meta property="og:image" content="${esc(image)}">
<meta name="twitter:card" content="summary_large_image">` : ''}
<link rel="stylesheet" href="${root}brand/tokens.css">
<style>
body { margin: 0 auto; max-width: 1000px; padding: var(--space-4) var(--space-4) var(--space-7); background: var(--sc-white);
  font: 16px/var(--leading-body) var(--font-body); color: var(--text-body); }
h1 { font-family: var(--font-headline); font-weight: 700; font-stretch: var(--stretch-condensed); font-size: 56px;
  line-height: var(--leading-display); letter-spacing: -0.01em; margin: 0 0 var(--space-2); }
h2 { font-family: var(--font-headline); font-weight: 700; font-size: 24px; margin-top: var(--space-7); }
.site-bar { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between;
  gap: 0 var(--space-5); border-bottom: 1px solid var(--border-line); margin-bottom: var(--space-5); }
.site-bar nav { display: flex; flex-wrap: wrap; gap: 0 var(--space-4); }
.site-bar a { display: inline-flex; align-items: center; min-height: 44px; color: var(--sc-navy); }
.site-bar [aria-current="page"] { color: var(--sc-red-600); font-weight: 700; }
.day-date { margin: 0 0 var(--space-2); font-size: 14px; font-variant-numeric: tabular-nums; }
.day-lead { max-width: 68ch; margin: 0 0 var(--space-4); }
.day-lead + h2 { margin: var(--space-4) 0 var(--space-2); }
.kicker { font-family: var(--font-headline); font-weight: 600; font-size: 14px; letter-spacing: var(--tracking-caps);
  text-transform: uppercase; color: var(--text-accent); }
.muted { color: var(--text-muted); }
img { max-width: 100%; height: auto; }
.card { border-radius: var(--radius-lg); box-shadow: var(--shadow-frame); }
summary { cursor: pointer; font-weight: 700; }
details { margin-top: var(--space-7); }
iframe { box-sizing: border-box; width: 100%; height: 80vh; border: 1px solid var(--border-line); border-radius: var(--radius-lg);
  box-shadow: var(--shadow-frame); background: var(--sc-white); }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 265px), 1fr));
  gap: var(--space-5); padding: 0; list-style: none; margin-bottom: var(--space-5); }
.grid a { display: block; height: 100%; color: inherit; text-decoration: none; }
.grid a:hover strong { text-decoration: underline; }
.grid img { display: block; box-sizing: border-box; width: 100%; aspect-ratio: 3 / 2; object-fit: contain;
  background: var(--sc-canvas); border: 1px solid var(--border-line);
  border-radius: var(--radius-md); margin-bottom: var(--space-2); }
.grid strong { display: block; font: 700 19px/1.35 var(--font-headline); }
.grid time { color: var(--text-muted); font-size: 14px; font-variant-numeric: tabular-nums; }
.day-summary { display: block; margin-top: var(--space-2); }
a { color: var(--sc-red-600); text-underline-offset: 0.18em; }
:focus-visible { outline: 2px solid var(--sc-navy); outline-offset: 3px; }
h3 { font-family: var(--font-headline); font-weight: 700; font-size: 18px; margin: var(--space-6) 0 var(--space-3); }
.who { display: inline-flex; align-items: center; gap: var(--space-2); font-family: var(--font-headline); font-weight: 700; color: var(--sc-navy); }
.num { display: inline-grid; place-items: center; width: 24px; height: 24px; border-radius: var(--radius-pill); background: var(--sc-navy);
  color: var(--sc-white); font-size: 13px; }
.pitches { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: var(--space-4); }
.pitch { padding: var(--space-4); border: 1px solid var(--border-line); border-radius: var(--radius-md); }
.pitch p { margin: var(--space-1) 0; font-size: 15px; }
.concept { font-family: var(--font-headline); font-weight: 700; font-size: 20px; color: var(--sc-red); margin: var(--space-2) 0; }
.clash { list-style: none; padding: 0; }
.clash li { display: grid; grid-template-columns: minmax(120px, 200px) 1fr; gap: var(--space-3); padding: var(--space-2) 0; border-bottom: 1px solid var(--border-line); }
.referee { padding: var(--space-3) var(--space-4); border-left: 4px solid var(--sc-navy); background: var(--sc-canvas); }
@media (max-width: 600px) {
  h1 { font-size: clamp(36px, 8.5vw, 56px); }
  .clash li { grid-template-columns: 1fr; gap: var(--space-1); }
}
</style>
</head>
<body>
${body}
</body>
</html>
`;
}

function siteNav(root, current, { previous, next } = {}) {
  const active = (name) => current === name ? ' aria-current="page"' : '';
  return `<header class="site-bar">
<nav aria-label="Daily Team"><a href="${root}"${active('latest')}>Latest tool</a><a href="${root}archive.html"${active('archive')}>All days</a></nav>
${previous || next ? `<nav aria-label="Adjacent days">
${previous ? `<a href="${root}${previous.date}/" rel="prev">Previous day</a>` : ''}
${next ? `<a href="${root}${next.date}/" rel="next">Next day</a>` : ''}
</nav>` : ''}
</header>`;
}

function grid(days, prefix, details) {
  return `<ul class="grid" role="list">\n${days.map((day) => {
    const asset = firstAsset(day);
    const { dir, cover, solution } = details.get(day);
    const image = asset && existsSync(join(dir, png(asset))) ? png(asset)
      : cover ? 'cover.png' : existsSync(join(dir, 'team.png')) ? 'team.png' : '';
    const href = `${prefix}${day.date}/`;
    const img = image ? `<img src="${href}${esc(image)}" alt="" loading="lazy">` : '';
    const summary = asset ? solution?.problem || day.decision || day.brief || day.task : 'No tool published.';
    return `<li><a href="${href}">${img}<strong>${esc(titleCase(title(day)))}</strong><time datetime="${day.date}">${day.date}</time><span class="day-summary">${esc(summary)}</span></a></li>`;
  }).join('\n')}\n</ul>`;
}

function dayFrames(day, { dir, team }) {
  return day.artifacts.filter((a) => a.status !== 'failed' && existsSync(join(dir, a.file))).map((a) => {
    const html = readFileSync(join(dir, a.file), 'utf8');
    const note = a.status === 'ok' ? '' : ` <span class="muted">(${esc(a.status)}: ${esc(a.problems.join('; '))})</span>`;
    const lead = team.members[a.lead - 1]?.role ?? '';
    const component = day.pack?.components.find((c) => c.row === a.row);
    const heading = a.kind === 'piece' ? 'Try it' : component ? component.name
      : a.row ? `Component ${a.row}${lead ? ` · ${lead}` : ''}` : 'Try it';
    return `<h2>${esc(heading)}${note}</h2>\n<iframe sandbox="${ARTIFACT_SANDBOX}" title="${esc(heading)}" srcdoc="${esc(html)}"></iframe>`;
  });
}

function dayPage(day, repo, archiveHtml, { root, pagesUrl, imagePrefix, current, neighbors }, { dir, cover, evidence, team, transcript, frames, solution }) {
  const comparison = existsSync(join(dir, 'comparison.html'))
    ? `<p><a href="${imagePrefix}comparison.html">Compare Opus, Sonnet, and Haiku</a>`
      + (existsSync(join(dir, 'comparison.mp4')) ? ` · <a href="${imagePrefix}comparison.mp4">Watch square video</a>` : '') + '</p>' : '';
  const plan = repo ? `<p><a href="https://github.com/${esc(repo)}/tree/main/${day.edition ? `editions/${encodeURIComponent(day.edition.lane)}/` : ''}days/${day.date}">${transcript ? 'Source' : 'Team plan and source'}</a></p>` : '';
  return page(`${day.date}: ${title(day)}`, [
    siteNav(root, current, neighbors),
    `<p class="day-date muted"><time datetime="${day.date}">${day.date}</time></p>`,
    `<h1>${esc(titleCase(title(day)))}</h1>`,
    `<p class="day-lead">${esc(day.decision || day.brief || day.task)}</p>`,
    ...(frames.length ? frames : [`<p>No project available. ${esc(day.error || '')}</p>`]),
    archiveHtml,
    '<details><summary>About this project</summary>',
    ...(solution ? [`<p><strong>Problem</strong> ${esc(solution.problem)}</p>`] : []),
    ...(solution ? [`<p>${esc(solution.improvement)}</p>`, `<p>${esc(solution.verification)}</p>`,
      ...(solution.source ? [`<p>${esc(solution.source.source)} · ${esc(solution.source.url)}</p>`] : [])] : []),
    ...(!day.edition ? [`<p><a href="${root}editions/">Extra editions</a></p>`] : []),
    day.request ? `<p>Request source: <a href="https://github.com/${esc(day.request.repository)}/issues/${Number(day.request.number)}">${esc(day.request.repository)} #${Number(day.request.number)}</a> · Local prototype</p>` : '',
    `<img class="card" src="${imagePrefix}team.png" alt="Team for ${day.date}: ${esc(memberRoles(team.members))}" loading="lazy">`,
    ...(hasSim(day, dir) ? [studioHtml(day, dir, imagePrefix)] : []),
    cover ? `<img src="${imagePrefix}cover.png" alt="Designed cover for ${esc(title(day))}" loading="lazy">` : '',
    comparison,
    ...(evidence.length ? ['<h2>Feed evidence</h2>', `<ul>${evidence.map(line => `<li>${esc(line)}</li>`).join('')}</ul>`] : []),
    ...(day.pack ? [`<p>Generated pack candidates await human review. <a href="${imagePrefix}pack.json">Pack manifest</a> · <a href="${imagePrefix}tokens.json">Shared tokens</a> · <a href="${imagePrefix}planning-input.json">Saved input</a></p>`] : []),
    transcript ? sessionHtml(transcript) : '', plan, '</details>',
  ].join('\n'), { root, image: pagesUrl ? `${pagesUrl}${day.date}/${cover ? 'cover.png' : 'team.png'}` : '' });
}

export function buildSite(siteDir, days, daysDir, repo, pagesUrl = '') {
  writeSite(siteDir, days, repo, pagesUrl, readDays(days, daysDir));
}

// Callers verify all records before rendering from them.
function writeSite(siteDir, days, repo, pagesUrl, details) {
  cpSync(join(HERE, 'brand'), join(siteDir, 'brand'), { recursive: true, mode: SITE_COPY_MODE });
  const newestFirst = [...days].reverse();
  const recent = newestFirst.slice(0, RECENT_DAYS);
  const previews = (root) => '<h2>Past projects</h2>\n' + grid(recent, root, details);
  const datedPreviews = previews('../');
  writeFileSync(join(siteDir, 'archive.html'), page('Daily Team archive', [
    siteNav('./', 'archive'), '<h1>All days</h1>', `<p class="muted">${plural(days.length, 'recorded day')}</p>`,
    grid(newestFirst, './', details),
  ].join('\n')));
  const latest = days.at(-1);
  let latestPage;
  for (const [index, day] of days.entries()) {
    const detail = details.get(day);
    const neighbors = { previous: days[index - 1], next: days[index + 1] };
    const out = join(siteDir, day.date);
    mkdirSync(out, { recursive: true });
    for (const f of ['team.png', 'cover.png', 'cover.html', 'cover.json', ...day.artifacts.map(png),
      ...(day.projectMode ? ['planning-input.json', ...day.artifacts.filter((a) => a.status !== 'failed').map((a) => a.file)] : []),
      ...(day.pack ? ['pack.json', 'tokens.json', 'planning-input.json', ...day.artifacts.filter((a) => a.status !== 'failed').map((a) => a.file)] : []),
      'comparison.html', 'comparison.png', 'comparison.mp4']) {
      const source = join(detail.dir, f);
      if (existsSync(source)) copyFileSync(source, join(out, f), SITE_COPY_MODE);
    }
    const content = { ...detail, frames: dayFrames(day, detail) };
    writeFileSync(join(out, 'index.html'), dayPage(day, repo, datedPreviews, { root: '../', pagesUrl, imagePrefix: '', neighbors }, content));
    if (day === latest) latestPage = dayPage(day, repo, previews('./'),
      { root: './', pagesUrl, imagePrefix: `./${day.date}/`, current: 'latest', neighbors }, content);
    if (hasSim(day, detail.dir)) writeFileSync(join(out, WATCH_FILE), watchHtml(day, detail.dir, { csp: SITE_CSP }));
  }
  writeFileSync(join(siteDir, 'index.html'), latestPage ?? page('Daily Team', `${siteNav('./', 'latest')}<h1>Daily Team</h1><p>No days yet.</p>`));
}

// The season a day belongs to: from its record, or by date for days recorded before seasons.
export function seasonNumber(seasons, day) {
  const recorded = parseTeam(day.team).season;
  if (recorded && seasons.includes(recorded)) return seasons.indexOf(recorded) + 1;
  const i = seasons.findLastIndex((s) => s <= day.date);
  return seasons.length ? Math.max(i, 0) + 1 : 0;
}

export function publish(root, { pagesUrl = '', site = '', repo = '', suggestions = [], cards = false } = {}) {
  const daysDir = join(root, 'days');
  const days = loadDays(daysDir);
  const details = readDays(days, daysDir);
  const seasons = listSeasons(root);
  for (const day of days) {
    const detail = details.get(day);
    const { dir } = detail;
    const card = join(dir, 'team.png');
    if (cards || !existsSync(card)) {
      if (!renderPng(cardHtml(day, seasonNumber(seasons, day)), card, 1200, 630)) {
        console.warn(`publish.mjs: Chrome not found, so ${day.date} has no team card`);
      }
    }
    rmSync(join(dir, 'team.svg'), { force: true });
    writeMarkdown(join(dir, 'README.md'), renderDayReadme(day, pagesUrl, detail));
  }
  writeMarkdown(join(root, 'ARCHIVE.md'), renderArchive(days, (day) => details.get(day).cover));
  const readme = join(root, 'README.md');
  const previous = readFileSync(readme, 'utf8');
  let text = replaceBlock(previous, 'TODAY', todayBlock(days.at(-1), daysDir, pagesUrl));
  text = replaceBlock(text, 'WEEK', weekBlock(root, days, suggestions));
  text = replaceBlock(text, 'RECENT', recentBlock(days, daysDir));
  if (text !== previous) writeFileSync(readme, text);
  if (site) writeSite(site, days, repo, pagesUrl, details);
  publishEditions(root, { site, repo, pagesUrl });
  return days.length;
}

export function publishEditions(root, { site = '', repo = '', pagesUrl = '' } = {}) {
  const links = [];
  for (const lane of ['news', 'culture', 'popular']) {
    const base = join(root, 'editions', lane), daysDir = join(base, 'days');
    const records = loadDays(daysDir), ready = [];
    if (!records.length) continue;
    const laneUrl = pagesUrl ? `${pagesUrl}editions/${lane}/` : '';
    const details = new Map();
    for (const day of records) {
      let detail;
      try { detail = readDay(day, daysDir); }
      catch (e) { console.warn(`Edition ${lane}/${day.date} withheld: ${e.message}`); continue; }
      const { dir } = detail;
      const card = join(dir, 'team.png');
      if (!existsSync(card)) renderPng(cardHtml(day, 1), card, 1200, 630);
      details.set(day, detail);
      writeMarkdown(join(dir, 'README.md'), renderDayReadme(day, laneUrl, detail));
      ready.push(day);
    }
    writeMarkdown(join(base, 'ARCHIVE.md'), renderArchive(ready, (day) => details.get(day).cover));
    writeMarkdown(join(base, 'README.md'), `# ${lane} editions\n\n[Main daily record](../../README.md)\n\n` + recentBlock(ready, daysDir) + '\n');
    if (site) writeSite(join(site, 'editions', lane), ready, repo, laneUrl, details);
    links.push(`<li><a href="${lane}/">${lane}</a>: ${ready.length} published / ${records.length} recorded</li>`);
  }
  if (site) {
    const out = join(site, 'editions'); mkdirSync(out, { recursive: true });
    writeFileSync(join(out, 'index.html'), page('Extra editions', `<h1>Extra editions</h1><p>News and popular: 30–31 October 2026. Culture: a different sourced culture daily until the queue ends. Normal daily runs continue.</p><ul>${links.join('')}</ul><a href="../">Normal daily run</a>`, { root: '../' }));
  }
}

function main() {
  const args = process.argv.slice(2);
  const opt = (name) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : '';
  };
  const file = opt('--suggestions');
  const suggestions = file && existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : [];
  const n = publish(opt('--root') || HERE, {
    pagesUrl: process.env.PAGES_URL, site: opt('--site'), repo: process.env.GITHUB_REPOSITORY, suggestions,
    cards: args.includes('--cards'),
  });
  console.log(`published ${n} days${opt('--site') ? ` and the site in ${opt('--site')}` : ''}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
