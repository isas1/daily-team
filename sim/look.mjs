#!/usr/bin/env node
// Designs how a studio day looks: one model call after the cover, so the replay shares the
// cover's art direction. Writes days/<date>/look.json. Never touches day.json (the cover's hash
// depends on it). On any failure it writes the rig defaults, so the replay always has a cast.
//
// Usage: node sim/look.mjs [--date YYYY-MM-DD] [--force] [--offline]
// Env:   LOOK_MODEL (default claude-sonnet-5-5), plus the provider settings run.mjs reads.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { completeChecked, parseTeam, prepareProvider, sections, today } from '../run.mjs';
import { defaultLook, lookProblems, normalizeLook } from './rig.mjs';
import { parseTurn } from './agent.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_LOOK_MODEL = 'claude-sonnet-5-5';

export function lookMessages(day, coverDirection, s = sections()) {
  const { members } = parseTeam(day.team);
  const cast = members.map((m, i) => `${i + 1}. ${m.role}${m.guest ? ` (${m.guest.kind} guest)` : ''}. Method: ${m.method}. Pushes for: ${m.stance}`).join('\n');
  return [
    { role: 'system', content: `${s['Studio look']}\n\nWriting rules:\n\n${s['Writing rules']}` },
    { role: 'user', content: `<cast>\n${cast}\n</cast>\n\nConcept: ${day.concept || ''}\nDecision: ${day.decision || ''}\nTask: ${day.brief || day.task}`
      + (coverDirection ? `\n\n<cover_direction note="the day's poster art direction; share its palette where it fits">\n${coverDirection.slice(0, 2500)}\n</cover_direction>` : '')
      + '\n\nReturn one JSON object only.' },
  ];
}

export async function designLook(day, dir, { complete, model = process.env.LOOK_MODEL || DEFAULT_LOOK_MODEL } = {}) {
  const { members } = parseTeam(day.team);
  let cover = '';
  try { cover = JSON.parse(readFileSync(join(dir, 'cover.json'), 'utf8')).direction || ''; } catch { /* no cover today */ }
  if (!complete) return { status: 'default', model: null, problems: [], look: defaultLook(members, day.date) };
  try {
    const ask = (messages, max) => complete(messages, max, model);
    const out = await completeChecked(ask, lookMessages(day, cover), 3000, (t) => {
      try { return lookProblems(parseTurn(t), members); } catch (e) { return [e.message]; }
    });
    const raw = parseTurn(out.text);
    return { status: out.problems.length ? 'repaired' : 'ok', model: out.model, problems: out.problems, look: normalizeLook(raw, members, day.date) };
  } catch (e) {
    return { status: 'default', model: null, problems: [e.message.slice(0, 200)], look: defaultLook(members, day.date) };
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const date = argv.includes('--date') ? argv[argv.indexOf('--date') + 1] : today();
  const dir = join(HERE, '..', 'days', date);
  const dayPath = join(dir, 'day.json');
  if (!existsSync(dayPath)) { console.log(`look: no day recorded for ${date}`); return; }
  const day = JSON.parse(readFileSync(dayPath, 'utf8'));
  if (!day.sim?.log || !existsSync(join(dir, day.sim.log))) { console.log(`look: ${date} has no studio sim, skipping`); return; }
  const out = join(dir, 'look.json');
  if (existsSync(out) && !argv.includes('--force')) { console.log(`look: ${date} already designed`); return; }
  const complete = argv.includes('--offline') ? null : prepareProvider(process.env.PROVIDER || day.provider || 'openrouter');
  const result = await designLook(day, dir, { complete });
  writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`look: ${result.status}${result.model ? ` (${result.model})` : ''}${result.problems.length ? `: ${result.problems.join('; ')}` : ''}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e.message); process.exit(1); });
