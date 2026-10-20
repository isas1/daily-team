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
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dayTitle, findBanned, parseTeam, planSections, teamFor, today } from './run.mjs';
import { listSeasons, readSeason } from './recruit.mjs';
import { cardHtml, renderPng, titleCase } from './card.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const RECENT_DAYS = 7;
const MIN_SCREENSHOT_BYTES = 8000;
const SANDBOX = 'allow-scripts allow-modals allow-downloads allow-popups allow-forms';
const SITE_CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'self' 'unsafe-inline'; "
  + "img-src 'self' data: blob:; media-src data: blob:; font-src 'self' data:; form-action 'none'";

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const cell = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');

export const title = dayTitle;
const roles = (day) => parseTeam(day.team).members.map((m) => m.role).join(' · ');
// A component day's piece is its headline asset; otherwise the first that worked.
const firstAsset = (day) => day.artifacts.find((a) => a.kind === 'piece' && a.status !== 'failed')
  ?? day.artifacts.find((a) => a.status !== 'failed');
const png = (a) => a.file.replace(/\.html$/, '.png');

export function loadDays(daysDir) {
  if (!existsSync(daysDir)) return [];
  return readdirSync(daysDir)
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && existsSync(join(daysDir, d, 'day.json')))
    .sort()
    .map((d) => JSON.parse(readFileSync(join(daysDir, d, 'day.json'), 'utf8')));
}

function assetLines(day, base, pagesUrl) {
  if (day.status === 'failed' && !day.plan) return [`No asset. The team could not run: ${day.error}`];
  const lines = [];
  for (const a of day.artifacts) {
    const lead = parseTeam(day.team).members[a.lead - 1]?.role ?? `member ${a.lead}`;
    if (a.status === 'failed') { lines.push(`${a.file}: no asset. ${a.problems.join('; ')}`, ''); continue; }
    if (existsSync(join(base.dir, png(a)))) lines.push(`<a href="${base.href}${a.file}"><img src="${base.href}${png(a)}" alt="Screenshot of ${esc(a.file)}" width="100%"></a>`, '');
    const use = pagesUrl ? `[Use it](${pagesUrl}${day.date}/) · ` : '';
    const note = a.status === 'ok' ? '' : ` Needs review: ${a.problems.join('; ')}.`;
    lines.push(`${use}[${a.file}](${base.href}${a.file}), led by ${lead}. Model: ${a.model}.${note}`, '');
  }
  return lines.length ? lines : ['No asset was requested for this day.'];
}

// The team session in parts, with speakers matched to member numbers. Null for days recorded
// before the Pitch and Clash format; those keep their plan as plain markdown.
export function session(day) {
  const parts = day.plan ? planSections(day.plan) : {};
  if (parts.Pitch === undefined || parts.Clash === undefined) return null;
  const members = parseTeam(day.team).members;
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
function guestNote(day) {
  const g = parseTeam(day.team).members.find((m) => m.guest);
  if (!g) return [];
  const voice = g.guest.kind === 'historical' || !session(day)
    ? 'The guest never speaks as the figure'
    : 'The guest speaks in character in original words, never quoting the source';
  return [`**Guest:** ${g.role} (${g.guest.kind}; ${g.guest.source}). The method is drawn from public-domain history, myth, or literature, or invented. ${voice}, and nothing here is endorsed by anyone.`, ''];
}

export function dayReadme(day, daysDir, pagesUrl) {
  const { constraint, season, suggestedBy } = parseTeam(day.team);
  const dir = join(daysDir, day.date);
  return [
    `# ${day.date}: ${title(day)}`, '',
    '[Today](../../README.md) · [Archive](../../ARCHIVE.md)', '',
    `<img src="team.png" alt="Team for ${day.date}: ${esc(roles(day))}" width="100%">`, '',
    `**Task:** ${day.brief || day.task}`, '',
    ...(suggestedBy ? [`**Suggested by:** ${suggestedBy}`, ''] : []),
    `**Constraint:** ${constraint}`, '',
    ...(season ? [`**Season:** ${season}`, ''] : []),
    ...(day.decision ? [`**Decision:** ${day.decision}`, ''] : []),
    '## Asset', '', ...assetLines(day, { dir, href: '' }, pagesUrl),
    ...(session(day) ? sessionMarkdown(session(day))
      : day.plan ? ['## Team plan', '', day.plan.replace(/^(#{1,5}) /gm, '#$1 '), ''] : []),
    ...guestNote(day),
    '## Team', '', '```text', day.team, '```', '',
    `Provider: ${day.provider}. Model: ${day.model ?? 'none'}.`, '',
  ].join('\n');
}

export function todayBlock(day, daysDir, pagesUrl) {
  if (!day) {
    const team = teamFor(today());
    return [`### ${today()}: ${parseTeam(team).task.split(':')[0]}`, '', 'The first daily run adds the team card and the asset here.', '', '```text', team, '```'].join('\n');
  }
  const base = `days/${day.date}/`;
  const a = firstAsset(day);
  const shot = a && join(daysDir, day.date, png(a));
  const lines = [
    `### ${day.date}: ${title(day)}`, '',
    `<a href="${base}"><img src="${base}team.png" alt="Team for ${day.date}: ${esc(roles(day))}" width="100%"></a>`, '',
    `**Task:** ${day.brief || day.task}`, '',
    ...(day.decision ? [`**Decision:** ${day.decision}`, ''] : []),
  ];
  if (shot && existsSync(shot)) {
    lines.push(`<a href="${base}"><img src="${base}${png(a)}" alt="Screenshot of today's asset" width="100%"></a>`, '');
    if (statSync(shot).size < MIN_SCREENSHOT_BYTES) lines.push('The screenshot may be blank. Open the day to check.', '');
  } else if (!a) lines.push(day.error ? `No asset today. ${day.error}` : 'No asset today.', '');
  const links = [`[Open the day](${base})`];
  if (pagesUrl && a) links.push(`[Use it](${pagesUrl}${day.date}/)`);
  links.push('[Archive](ARCHIVE.md)');
  lines.push(links.join(' · '));
  return lines.join('\n');
}

export function recentBlock(days) {
  if (!days.length) return 'The archive starts with the first daily run.';
  const rows = [...days].reverse().slice(0, RECENT_DAYS).map((d) => {
    const a = firstAsset(d);
    const thumb = a ? `<a href="days/${d.date}/"><img src="days/${d.date}/${png(a)}" alt="${esc(title(d))}" width="160"></a>` : 'No asset';
    return `| [${d.date}](days/${d.date}/) | ${thumb} | ${cell(title(d))} | ${cell(roles(d))} |`;
  });
  return ['| Date | Asset | Task | Team |', '|---|---|---|---|', ...rows, '', `[All ${plural(days.length, 'day')}](ARCHIVE.md)`].join('\n');
}

export function archive(days) {
  const rows = [...days].reverse().map((d) => {
    const a = firstAsset(d);
    const asset = a ? `[${a.status === 'ok' ? 'asset' : 'asset, needs review'}](days/${d.date}/${a.file})` : 'no asset';
    return `| [${d.date}](days/${d.date}/) | ${cell(title(d))} | ${cell(roles(d))} | ${cell(parseTeam(d.team).constraint)} | ${asset} |`;
  });
  return [
    '# Archive', '', `Every daily team and the asset it made, newest first. ${plural(days.length, 'day')} recorded.`, '',
    '[Today](README.md)', '',
    '| Date | Task | Team | Constraint | Asset |', '|---|---|---|---|---|', ...rows, '',
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
      ? `New this season: ${new Intl.ListFormat('en', { type: 'conjunction' }).format(fresh)}.` : 'The first season, so everyone is new.'} A new season with 8 new roles and 8 new methods is drafted every Monday.`, '');
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
body { margin: 0 auto; max-width: 1000px; padding: var(--space-7) var(--space-4); background: var(--sc-white);
  font: 16px/var(--leading-body) var(--font-body); color: var(--text-body); }
h1 { font-family: var(--font-headline); font-weight: 700; font-stretch: var(--stretch-condensed); font-size: 56px;
  line-height: var(--leading-display); letter-spacing: -0.01em; margin: 0 0 var(--space-2); }
h2 { font-family: var(--font-headline); font-weight: 700; font-size: 24px; margin-top: var(--space-7); }
.kicker { font-family: var(--font-headline); font-weight: 600; font-size: 14px; letter-spacing: var(--tracking-caps);
  text-transform: uppercase; color: var(--text-accent); }
.muted { color: var(--text-muted); }
img { max-width: 100%; height: auto; }
.card { border-radius: var(--radius-lg); box-shadow: var(--shadow-frame); }
iframe { width: 100%; height: 80vh; border: 1px solid var(--border-line); border-radius: var(--radius-lg);
  box-shadow: var(--shadow-frame); background: var(--sc-white); }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: var(--space-4); padding: 0; list-style: none; }
.grid a { color: inherit; text-decoration: none; }
.grid img { display: block; border: 1px solid var(--border-line); border-radius: var(--radius-md); margin-bottom: var(--space-2); }
a { color: var(--sc-red); }
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
@media (max-width: 600px) { .clash li { grid-template-columns: 1fr; gap: var(--space-1); } }
</style>
</head>
<body>
${body}
</body>
</html>
`;
}

function grid(days, prefix) {
  return `<h2>All days</h2>\n<ul class="grid">\n${[...days].reverse().map((d) => {
    const a = firstAsset(d);
    const img = a ? `<img src="${prefix}${d.date}/${png(a)}" alt="" loading="lazy">` : `<img src="${prefix}${d.date}/team.png" alt="" loading="lazy">`;
    return `<li><a href="${prefix}${d.date}/">${img}<strong>${d.date}</strong><br>${esc(title(d))}</a></li>`;
  }).join('\n')}\n</ul>`;
}

function dayPage(day, daysDir, repo, archiveHtml, { root, pagesUrl, imagePrefix }) {
  const frames = day.artifacts.filter((a) => a.status !== 'failed' && existsSync(join(daysDir, day.date, a.file))).map((a) => {
    const html = readFileSync(join(daysDir, day.date, a.file), 'utf8');
    const note = a.status === 'ok' ? '' : ` <span class="muted">(${esc(a.status)}: ${esc(a.problems.join('; '))})</span>`;
    const lead = parseTeam(day.team).members[a.lead - 1]?.role ?? '';
    const heading = a.kind === 'piece' ? 'The piece' : a.row ? `Component ${a.row}${lead ? ` · ${lead}` : ''}` : 'The tool';
    return `<h2>${esc(heading)}${note}</h2>\n<iframe sandbox="${SANDBOX}" title="${esc(a.file)}" srcdoc="${esc(html)}"></iframe>`;
  });
  const s = session(day);
  const plan = repo ? `<p><a href="https://github.com/${esc(repo)}/tree/main/days/${day.date}">${s ? 'Source' : 'Team plan and source'}</a></p>` : '';
  return page(`${day.date}: ${title(day)}`, [
    `<div class="kicker">Daily team · ${day.date}</div>`,
    `<h1>${esc(titleCase(title(day)))}</h1>`,
    `<p class="muted">${esc(day.brief || day.task)}</p>`,
    `<img class="card" src="${imagePrefix}team.png" alt="Team for ${day.date}: ${esc(roles(day))}">`,
    day.decision ? `<p><strong>Decision:</strong> ${esc(day.decision)}</p>` : '',
    ...(frames.length ? frames : [`<p>No asset. ${esc(day.error || '')}</p>`]),
    s ? sessionHtml(s) : '', plan, archiveHtml,
  ].join('\n'), { root, image: pagesUrl ? `${pagesUrl}${day.date}/team.png` : '' });
}

export function buildSite(siteDir, days, daysDir, repo, pagesUrl = '') {
  cpSync(join(HERE, 'brand'), join(siteDir, 'brand'), { recursive: true });
  for (const day of days) {
    const out = join(siteDir, day.date);
    mkdirSync(out, { recursive: true });
    for (const f of ['team.png', ...day.artifacts.map(png)]) {
      if (existsSync(join(daysDir, day.date, f))) copyFileSync(join(daysDir, day.date, f), join(out, f));
    }
    writeFileSync(join(out, 'index.html'), dayPage(day, daysDir, repo, grid(days, '../'), { root: '../', pagesUrl, imagePrefix: '' }));
  }
  const latest = days.at(-1);
  writeFileSync(join(siteDir, 'index.html'), latest
    ? dayPage(latest, daysDir, repo, grid(days, './'), { root: './', pagesUrl, imagePrefix: `./${latest.date}/` })
    : page('daily-team', '<p>No days yet.</p>'));
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
  const seasons = listSeasons(root);
  for (const day of days) {
    const card = join(daysDir, day.date, 'team.png');
    if (cards || !existsSync(card)) {
      if (!renderPng(cardHtml(day, seasonNumber(seasons, day)), card, 1200, 630)) {
        console.warn(`publish.mjs: Chrome not found, so ${day.date} has no team card`);
      }
    }
    rmSync(join(daysDir, day.date, 'team.svg'), { force: true });
    writeFileSync(join(daysDir, day.date, 'README.md'), dayReadme(day, daysDir, pagesUrl));
  }
  writeFileSync(join(root, 'ARCHIVE.md'), archive(days));
  const readme = join(root, 'README.md');
  let text = readFileSync(readme, 'utf8');
  text = replaceBlock(text, 'TODAY', todayBlock(days.at(-1), daysDir, pagesUrl));
  text = replaceBlock(text, 'WEEK', weekBlock(root, days, suggestions));
  text = replaceBlock(text, 'RECENT', recentBlock(days));
  writeFileSync(readme, text);
  if (site) buildSite(site, days, daysDir, repo, pagesUrl);
  return days.length;
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
