#!/usr/bin/env node
// Reuse a day's plan for a three-model comparison. Checkpoint every result; reruns resume.
// node compare.mjs --date 2026-10-21 [--view-only] [--seconds 4] [--force]
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addCsp, checkArtifact, completeChecked, completeClaude, extractHtml, prepareProvider, rowLead, sections } from './run.mjs';
import { comparisonHtml } from './comparison-view.mjs';
import { applyTokens, assertPackExport, packArtifactProblems, packBuildRules } from './component-pack.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const COMPARISON_MODELS = [
  { key: 'opus', label: 'Opus', model: process.env.COMPARE_OPUS_MODEL || 'claude-opus-5-5' },
  { key: 'sonnet', label: 'Sonnet', model: process.env.COMPARE_SONNET_MODEL || 'claude-sonnet-5-5' },
  { key: 'haiku', label: 'Haiku', model: process.env.COMPARE_HAIKU_MODEL || 'claude-haiku-5-5' },
];

export function comparisonRows(day) {
  const table = new Map([...day.plan.matchAll(/^\|\s*(\d+)\s*\|([^\n]+)$/gm)].map((m) => {
    const cells = m[2].split('|').map((s) => s.trim());
    return [Number(m[1]), { name: cells[1], input: cells[3] }];
  }));
  return day.artifacts.filter((a) => a.row && a.kind !== 'piece').sort((a, b) => a.row - b.row)
    .map((a) => ({ row: a.row, name: day.pack?.components.find((c) => c.row === a.row)?.name || table.get(a.row)?.name || `Component ${a.row}`,
      input: day.pack?.components.find((c) => c.row === a.row)?.input || table.get(a.row)?.input || 'tap', source: a }));
}

export async function buildComparison(dir, { seconds = 4, viewOnly = false, force = false,
  models = COMPARISON_MODELS, complete = completeClaude } = {}) {
  if (!Number.isFinite(seconds) || seconds < 3 || seconds > 5) throw new Error('seconds must be between 3 and 5');
  const day = JSON.parse(readFileSync(join(dir, 'day.json'), 'utf8'));
  if (day.packMode) assertPackExport(day, dir);
  if (!day.component || !day.plan) throw new Error('comparison needs a component day with a recorded plan');
  const sourceRows = comparisonRows(day);
  if (!sourceRows.length) throw new Error('no component rows in day.json');
  const s = sections();
  const recordPath = join(dir, 'comparison.json');
  const old = existsSync(recordPath) ? JSON.parse(readFileSync(recordPath, 'utf8')) : { rows: [] };
  const taskWords = (day.brief || day.task).split(':')[0].trim().split(/\s+/);
  const record = { date: day.date, task: day.task, hook: `Build ${taskWords.length < 2 ? 'one ' : ''}${taskWords.slice(0, 6).join(' ')}`,
    seconds, models, status: 'pending', rows: [] };
  const save = () => {
    record.status = record.rows.length === sourceRows.length && record.rows.every((r) =>
      models.every((m) => r.variants[m.key]?.status === 'ok')) ? 'ok' : 'incomplete';
    writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`);
    writeFileSync(join(dir, 'comparison.html'), comparisonHtml(record, dir));
  };
  for (const row of sourceRows) {
    const entry = { row: row.row, name: row.name, input: row.input, variants: {} };
    record.rows.push(entry);
    const messages = [{ role: 'system', content: `Writing rules:\n\n${s['Writing rules']}` }, {
      role: 'user', content: `<team>\n${day.team}\n</team>\n\n<plan>\n${day.plan}\n</plan>\n\n`
        + (day.pack ? packBuildRules(day.pack, row.row) : '')
        + s[day.pack ? 'Build a pack component' : 'Build a component'].replaceAll('{{ROW}}', String(row.row)).replaceAll('{{LEAD}}', String(rowLead(row.row))),
    }];
    const hash = createHash('sha256').update(JSON.stringify(messages)).digest('hex');
    // Model calls stay sequential: predictable subscription load and safe checkpoints.
    for (const m of models) {
      const previous = old.rows.find((r) => r.row === row.row)?.variants[m.key];
      const file = `compare-${m.key}-${row.row}.html`;
      if (m.key === 'opus' && row.source.model === m.model && row.source.status === 'ok'
        && existsSync(join(dir, row.source.file))) {
        entry.variants[m.key] = { ...row.source, requestedModel: m.model, hash };
      } else if (!force && previous?.hash === hash && previous.requestedModel === m.model
        && previous.status === 'ok' && existsSync(join(dir, previous.file))) {
        entry.variants[m.key] = previous;
      } else if (viewOnly) {
        entry.variants[m.key] = previous?.hash === hash && previous.requestedModel === m.model ? previous
          : { file, requestedModel: m.model, model: null, status: 'missing', problems: ['Not generated'] };
      } else {
        rmSync(join(dir, 'comparison.mp4'), { force: true });
        try {
          const out = await completeChecked((ms, max) => complete(ms, max, m.model), messages, 16000, (t) => {
            const html = extractHtml(t);
            return html ? [...checkArtifact(html, 'component'), ...(day.pack ? packArtifactProblems(html) : [])] : ['no HTML code block'];
          });
          const html = extractHtml(out.text);
          if (!html) throw new Error('model returned no HTML');
          if (out.model !== m.model) throw new Error(`requested ${m.model}, received ${out.model}`);
          writeFileSync(join(dir, file), `${addCsp(day.pack ? applyTokens(html, day.pack.tokens) : html)}\n`);
          entry.variants[m.key] = { file, hash, requestedModel: m.model, model: out.model,
            status: out.problems.length ? 'needs review' : 'ok', problems: out.problems };
        } catch (e) {
          entry.variants[m.key] = { file, hash, requestedModel: m.model, model: null, status: 'failed', problems: [e.message] };
        }
      }
      save();
      console.log(`row ${row.row} ${m.label}: ${entry.variants[m.key].status}`);
    }
  }
  save();
  const qaFile = join(dir, 'comparison-qa.json');
  const sourceHash = createHash('sha256').update(readFileSync(join(dir, 'comparison.html'))).digest('hex');
  if (!existsSync(qaFile) || JSON.parse(readFileSync(qaFile, 'utf8')).sourceHash !== sourceHash) {
    rmSync(join(dir, 'comparison.mp4'), { force: true });
  }
  return record;
}

async function main() {
  const args = process.argv.slice(2);
  const opts = { days: join(HERE, 'days'), seconds: 4 };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--view-only') opts.viewOnly = true;
    else if (a === '--force') opts.force = true;
    else if (['--date', '--days', '--seconds'].includes(a)) {
      if (!args[i + 1]) throw new Error(`${a} needs a value`);
      opts[a.slice(2)] = a === '--seconds' ? Number(args[++i]) : args[++i];
    } else throw new Error(`unknown argument ${a}`);
  }
  const date = opts.date || readdirSync(opts.days).filter((f) => /^\d{4}-\d{2}-\d{2}$/.test(f)).sort().at(-1);
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('date must be YYYY-MM-DD');
  const dir = resolve(opts.days, date);
  mkdirSync(dir, { recursive: true });
  if (!opts.viewOnly) prepareProvider('claude');
  const record = await buildComparison(dir, opts);
  console.log(`${dir}/comparison.html: ${record.status}`);
  if (!opts.viewOnly && record.status !== 'ok') process.exitCode = 3;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e.message); process.exitCode = 1; });
