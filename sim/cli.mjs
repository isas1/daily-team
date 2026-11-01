#!/usr/bin/env node
// Runs the studio sim alone for one date and prints what happened, without the scribe or any
// build. For trying the sim locally, and for live mode (sim/live.mjs --run).
//
// Usage: node sim/cli.mjs [--date YYYY-MM-DD] [--rounds N] [--out dir] [--model id]
//                         [--max-usd N] [--no-interviews] [--quiet]
// Writes <out>/<date>/sim.jsonl (default out: a temp folder, so days/ stays untouched).
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findBanned, parseTeam, prepareProvider, sections, teamFor, today } from '../run.mjs';
import { appendTo, DEFAULT_SIM_MODEL, interviews, meteredAsk, runSim } from './run-sim.mjs';
import { clashSection, pitchSection } from './adapter.mjs';

function args(argv) {
  const o = { date: today(), rounds: 12, out: '', model: process.env.SIM_MODEL || DEFAULT_SIM_MODEL, maxUsd: 2, interviews: true, quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const v = () => argv[++i];
    if (a === '--date') o.date = v();
    else if (a === '--rounds') o.rounds = Number(v());
    else if (a === '--out') o.out = v();
    else if (a === '--model') o.model = v();
    else if (a === '--max-usd') o.maxUsd = Number(v());
    else if (a === '--no-interviews') o.interviews = false;
    else if (a === '--quiet') o.quiet = true;
    else { console.error(`unknown option ${a}`); process.exit(2); }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(o.date)) { console.error('--date must be YYYY-MM-DD'); process.exit(2); }
  if (!(o.rounds >= 6 && o.rounds <= 40)) { console.error('--rounds must be 6 to 40'); process.exit(2); }
  return o;
}

export function line(e) {
  if (e.type === 'phase') return `\n== Round ${e.r} · ${e.text}`;
  if (e.type === 'event') return `   [news] ${e.text}`;
  if (e.type === 'think') return `   (${e.who} thinks: ${e.text})`;
  if (e.type === 'say') return `   ${e.who}${e.to && e.to !== 'all' ? ` → ${e.to}` : ''}: ${e.text}`;
  if (e.type === 'move') return `   ${e.who} walks to the ${e.to}`;
  if (e.type === 'act' && e.act !== 'rest') return `   * ${e.who} ${e.act}${e.target ? ` ${e.target}` : ''}${e.concept ? ` "${e.concept}"` : ''}`;
  if (e.type === 'vote') return `   * ${e.who} votes ${e.target}`;
  if (e.type === 'result') return `   >> ${e.concept} by ${e.by} wins (${e.votes} votes${e.tie ? ', tie broken by the lead' : ''})`;
  if (e.type === 'beat') return `   ** ${e.text}`;
  if (e.type === 'idle') return `   ${e.who} stays quiet (${e.text})`;
  if (e.type === 'refused') return `   ${e.who} tried to ${e.act}: ${e.text}`;
  if (e.type === 'interview') return `\n[interview] ${e.who}\n   day: ${e.day}\n   lost: ${e.lost}\n   trust: ${e.trust}`;
  return null;
}

async function main() {
  const o = args(process.argv.slice(2));
  const complete = prepareProvider('claude');
  const team = teamFor(o.date);
  const { members, task, constraint } = parseTeam(team);
  const out = o.out || mkdtempSync(join(tmpdir(), 'daily-team-sim-'));
  const logPath = join(out, o.date, 'sim.jsonl');
  const { ask, meter } = meteredAsk(complete, o.model, o.maxUsd);
  const started = Date.now();
  const print = (e) => { if (!o.quiet) { const l = line(e); if (l) console.log(l); } };
  console.log(team);
  const { world, events } = await runSim({ ask, date: o.date, members, task, constraint, rounds: o.rounds, sections: sections(), findBanned, logPath, onEvent: print });
  if (o.interviews) await interviews({ ask, world, sections: sections(), findBanned, emit: (e) => { appendTo(logPath, events)(e); print(e); } });
  const count = (t, f = () => true) => events.filter((e) => e.type === t && f(e)).length;
  console.log(`\n## Pitch\n\n${pitchSection(world, events)}\n\n## Clash\n\n${clashSection(events)}\n`);
  console.log(JSON.stringify({
    log: logPath, rounds: o.rounds, model: [...meter.models].join(', '), calls: meter.calls, costUsd: Number(meter.costUsd.toFixed(4)),
    seconds: Math.round((Date.now() - started) / 1000), idle: count('idle'), refused: count('refused'), beats: count('beat'),
    blocks: count('act', (e) => e.act === 'block'), backs: count('act', (e) => e.act === 'back'), proposals: count('act', (e) => e.act === 'propose'),
    sideTalk: count('say', (e) => e.station === 'kitchen'), trustSwings: count('beat', (e) => e.why === 'trust'), result: world.result,
  }, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e.message); process.exit(1); });
