// Turns a studio day into the session format the pipeline already reads. The sim supplies the
// Pitch and Clash; one scribe call writes the Decision, Build notes and any JSON the day's mode
// needs. run.mjs then checks and stores the plan as it always has.
import { join } from 'node:path';
import { appendTo, interviews, meteredAsk, readMemory, runSim, writeMemory, DEFAULT_SIM_MODEL } from './run-sim.mjs';
import { DEFAULT_ROUNDS } from './world.mjs';

const MAX_PITCH_LINES = 6;
const CLASH = [6, 10];
const TURNS = 3;
const SCORE = { block: 4, propose: 3, back: 3, vote: 2 };

const sentences = (s) => String(s ?? '').match(/[^.?]+[.?]*/g)?.map((x) => x.trim()).filter(Boolean) ?? [];

export function pitchSection(world, events) {
  return world.members.map((m) => {
    const item = world.board.find((b) => b.by === m.label && b.kind === 'pitch')
      ?? world.board.find((b) => b.by === m.label);
    const said = events.find((e) => e.type === 'say' && e.who === m.label && e.act === 'pitch')?.text
      ?? item?.text
      ?? events.find((e) => e.type === 'say' && e.who === m.label && ['arrive', 'pitch'].includes(e.phase))?.text
      ?? 'Listened and kept their idea back.';
    const concept = item?.concept ?? 'No pitch';
    return [`**${m.label}: ${concept}**`, ...sentences(said).slice(0, MAX_PITCH_LINES)].join('\n');
  }).join('\n\n');
}

// The strongest spoken lines of the day: arguments first, at most 3 per member, in order.
export function clashLines(events) {
  const says = events.filter((e) => e.type === 'say' && e.act !== 'pitch' && e.phase !== 'review' && e.text);
  const weight = (e) => (SCORE[e.act] ?? 0) + (['clash', 'decide'].includes(e.phase) ? 2 : 0) + (e.to && e.to !== 'all' ? 1 : 0);
  const ranked = [...says].sort((a, b) => weight(b) - weight(a) || a.seq - b.seq);
  const turns = {};
  const picked = [];
  for (const e of ranked) {
    if (picked.length >= CLASH[1]) break;
    if ((turns[e.who] ?? 0) >= TURNS) continue;
    turns[e.who] = (turns[e.who] ?? 0) + 1;
    picked.push(e);
  }
  return picked.sort((a, b) => a.seq - b.seq);
}

export const clashSection = (events) => clashLines(events).map((e) => `**${e.who}:** ${e.text.replace(/\s+/g, ' ').trim()}`).join('\n\n');

// What happened, in public: speech, acts and news. Never thoughts.
export function transcript(events) {
  const out = [];
  for (const e of events) {
    if (e.type === 'event') out.push(`Round ${e.r}, news: ${e.text}`);
    else if (e.type === 'say') out.push(`Round ${e.r} (${e.phase}), ${e.who}${e.to && e.to !== 'all' ? ` to ${e.to}` : ''}: ${e.text}`);
    else if (e.type === 'act' && ['pitch', 'propose', 'back', 'block'].includes(e.act)) out.push(`Round ${e.r}, ${e.who} ${e.act}s ${e.target} "${e.concept}"`);
    else if (e.type === 'vote') out.push(`Round ${e.r}, ${e.who} votes for ${e.target} "${e.concept}"`);
    else if (e.type === 'result') out.push(`Result: ${e.id} "${e.concept}" by ${e.by} wins with ${e.votes} votes${e.tie ? ' after the lead broke a tie' : ''}. Tally: ${JSON.stringify(e.tally)}`);
  }
  return out.join('\n');
}

export function scribeMessages({ system, context, world, events, pitch, clash, work, sections }) {
  const result = world.result ? `${world.result.id} "${world.result.concept}" by ${world.result.by}` : 'no vote was counted; the lead\'s pitch stands';
  return [system, {
    role: 'user',
    content: `${context}\n\n<studio_record note="what the team said and did today">\n${transcript(events)}\n</studio_record>\n\nThe vote chose: ${result}.\n\n`
      + `<session_so_far>\n## Pitch\n\n${pitch}\n\n## Clash\n\n${clash}\n</session_so_far>\n\n${sections['Studio scribe']}\n\n<mode_rules>\n${work}\n</mode_rules>`,
  }];
}

// Keeps only what comes after the Clash, whatever the scribe wrote first.
export function afterClash(text) {
  const t = String(text ?? '').trim();
  const i = t.search(/^#{1,3}\s*\**(Decision|Deadlock|Referee)\b/m);
  return i < 0 ? t : t.slice(i);
}

export const joinPlan = (pitch, clash, rest) => `## Pitch\n\n${pitch}\n\n## Clash\n\n${clash}\n\n${afterClash(rest)}`;

// The whole studio path for run.mjs. Returns { text, model, problems } like completeChecked,
// plus the sim summary for day.json. Throws on failure, so run.mjs can fall back.
export async function simPlan({ complete, completeChecked, date, team, parseTeam, sections, findBanned, system, context, work, check, maxTokens, dir, daysDir, env = process.env }) {
  const { members, task, constraint, season } = parseTeam(team);
  const rounds = Number(env.SIM_ROUNDS) || DEFAULT_ROUNDS;
  const maxUsd = env.SIM_MAX_USD ? Number(env.SIM_MAX_USD) : Infinity;
  const { ask, meter } = meteredAsk(complete, env.SIM_MODEL || DEFAULT_SIM_MODEL, maxUsd);
  const memory = Object.fromEntries(Object.entries(readMemory(daysDir, season))
    .map(([k, v]) => [k, v.filter((x) => x.date < date)]));
  const logPath = join(dir, 'sim.jsonl');
  const { world, events } = await runSim({
    ask, date, members, task, constraint, rounds, concurrency: Number(env.SIM_CONCURRENCY) || 4,
    sections, findBanned, logPath, memory,
  });
  const pitch = pitchSection(world, events);
  const clash = clashSection(events);
  const out = await completeChecked(complete, scribeMessages({ system, context, world, events, pitch, clash, work, sections }), maxTokens,
    (t) => check(joinPlan(pitch, clash, t)));
  const emit = appendTo(logPath, events);
  if (env.SIM_INTERVIEWS !== '0') await interviews({ ask, world, sections, findBanned, emit });
  writeMemory(daysDir, season, date, world);
  const summary = {
    log: 'sim.jsonl', rounds, model: [...meter.models].join(', ') || (env.SIM_MODEL || DEFAULT_SIM_MODEL), calls: meter.calls,
    costUsd: Number(meter.costUsd.toFixed(4)), scribeCostUsd: Number((Number(out.costUsd) || 0).toFixed(4)), idle: events.filter((e) => e.type === 'idle').length,
    beats: events.filter((e) => e.type === 'beat').length, result: world.result,
    events: world.events.map((e) => e.text), interviews: events.filter((e) => e.type === 'interview').length,
  };
  return { text: joinPlan(pitch, clash, out.text), model: out.model, problems: out.problems, summary, world, events, ask, meter, logPath };
}
