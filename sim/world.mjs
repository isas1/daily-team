// The studio world and its director. Pure code, no model calls: stations, phases, energy,
// trust, the board, the keyboard, seeded events, and beats. sim/run-sim.mjs asks the members
// what they do and calls applyTurn() with their answers.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

export const STATIONS = ['whiteboard', 'workbench', 'wall', 'kitchen', 'door'];
export const MOVES = [...STATIONS, 'stay'];
export const ACTS = ['pitch', 'back', 'block', 'propose', 'vote', 'type', 'rest', 'none'];
export const DEFAULT_ROUNDS = 16;
export const MAX_ENERGY = 5;
export const BOARD_SLOTS = 6;
const TRUST = [-3, 3];

// Phase ends for a 16-round day; other lengths scale. Every phase gets at least one round.
const PHASES = [['arrive', 2], ['pitch', 5], ['clash', 10], ['decide', 12], ['build', 15], ['wrap', 16]];
const PHASE_RULES = {
  arrive: 'Arrive. Read the wall, look around, say hello or keep to yourself.',
  pitch: 'Pitch. Go to the whiteboard and pitch once, if you have not yet.',
  clash: 'Clash. Back, block or propose. Argue from what you push for and what you fear.',
  decide: 'Decide. Vote for one board item at the whiteboard. A tie goes to the lead.',
  build: 'Build. The lead holds the keyboard at the workbench. Others review, push one change, or rest.',
  wrap: 'Wrap. Say one closing line. Who gets credit for what?',
};

export function phaseEnds(rounds) {
  const ends = [];
  let last = 0;
  for (const [name, end] of PHASES) {
    const left = PHASES.length - ends.length - 1;
    last = Math.min(rounds - left, Math.max(last + 1, Math.round((end * rounds) / DEFAULT_ROUNDS)));
    ends.push([name, last]);
  }
  return ends;
}

export const phaseOf = (round, rounds) => phaseEnds(rounds).find(([, end]) => round <= end)[0];

// Park-Miller, as in team.sh, so a date always draws the same events.
export function seededRandom(date, pid) {
  const day = Math.round(Date.parse(`${date}T00:00:00Z`) / 86_400_000);
  let seed = (day * 7919 + pid * 104729 + 12345) % 2147483647 || 1;
  return () => { seed = (seed * 16807) % 2147483647; return seed; };
}

export function readEvents(file = join(HERE, 'events.txt')) {
  return readFileSync(file, 'utf8').split('\n').filter((l) => l.trim() && !l.startsWith('#')).map((l) => {
    const [phase, kind, text] = l.split(' | ').map((s) => s.trim());
    return { phase, kind, text };
  });
}

// One Clash event and one Build event, each on a fixed round of its phase. A guest may arrive late.
export function scheduleEvents(date, rounds, members, pool = readEvents()) {
  const rnd = seededRandom(date, 8);
  const ends = Object.fromEntries(phaseEnds(rounds));
  const starts = { clash: ends.pitch + 1, build: ends.decide + 1 };
  const out = [];
  for (const phase of ['clash', 'build']) {
    const options = pool.filter((e) => e.phase === phase);
    if (!options.length) continue;
    const e = options[rnd() % options.length];
    const span = ends[phase] - starts[phase] + 1;
    const target = e.kind === 'tired' && /One member/.test(e.text) ? members[rnd() % members.length].label : null;
    out.push({ ...e, round: starts[phase] + Math.min(1, span - 1), target });
  }
  const guest = members.find((m) => m.guest);
  if (guest && rnd() % 2 === 0) {
    out.push({ phase: 'pitch', kind: 'late', text: `${guest.label} arrives late.`, round: Math.min(ends.arrive + 1, rounds), target: guest.label });
  }
  return out.sort((a, b) => a.round - b.round);
}

// Each member watches one other member whose pushes threaten their own. Never themselves.
export function rivals(date, n = 4) {
  const rnd = seededRandom(date, 9);
  const shift = 1 + (rnd() % (n - 1));
  return Array.from({ length: n }, (_, i) => (i + shift) % n);
}

export function createWorld({ date, members, task, constraint, rounds = DEFAULT_ROUNDS, events, memory = {} }) {
  const cast = members.map((m, i) => ({
    n: i + 1, label: m.role, method: m.method, stance: m.stance, temperament: m.temperament || '',
    guest: m.guest, historical: m.guest?.kind === 'historical',
    station: 'door', energy: MAX_ENERGY, mood: 'curious', notes: [], pitched: false, vote: null,
    trust: {}, idle: 0, present: true, memory: memory[m.role] ?? [], said: [], proposed: false,
  }));
  for (const m of cast) for (const o of cast) if (o !== m) m.trust[o.label] = 0;
  const r = rivals(date, cast.length);
  cast.forEach((m, i) => { m.rival = cast[r[i]].label; });
  const world = {
    date, task, constraint, rounds, round: 0, phase: 'arrive', members: cast, board: [],
    keyboard: null, keyboardBroken: 0, progress: 0, events: events ?? scheduleEvents(date, rounds, cast),
    heard: [], blocks: 0, nudged: false, result: null, seq: 0,
  };
  for (const e of world.events) if (e.kind === 'late') cast.find((m) => m.label === e.target).present = false;
  return world;
}

const byLabel = (world, label) => world.members.find((m) => m.label.toLowerCase() === String(label ?? '').trim().toLowerCase());
const clampTrust = (v) => Math.max(TRUST[0], Math.min(TRUST[1], v));

// Starts a round: phase, events, keyboard, and the nudge that keeps the Clash honest.
// Returns the events to log.
export function startRound(world) {
  world.round++;
  world.phase = phaseOf(world.round, world.rounds);
  const out = [{ type: 'phase', text: PHASE_RULES[world.phase] }];
  if (world.keyboardBroken > 0) world.keyboardBroken--;
  for (const e of world.events.filter((x) => x.round === world.round)) {
    out.push({ type: 'event', kind: e.kind, text: e.text, target: e.target }, { type: 'beat', why: 'event', text: e.text });
    if (e.kind === 'late') byLabel(world, e.target).present = true;
    if (e.kind === 'break') { world.keyboardBroken = 1; if (world.keyboard) out.push({ type: 'keyboard', who: null, text: 'The keyboard stops.' }); }
    if (e.kind === 'tired') {
      for (const m of world.members) {
        if (e.target && m.label !== e.target) continue;
        m.energy = Math.max(0, m.energy - (e.target ? 2 : 1));
      }
    }
  }
  // Disagreement floor: halfway through the Clash, nobody has blocked yet.
  const clash = phaseEnds(world.rounds).find(([p]) => p === 'clash')[1];
  const pitchEnd = phaseEnds(world.rounds).find(([p]) => p === 'pitch')[1];
  const lead = leadingItem(world);
  const pileOn = lead && lead.support.size >= 3;
  if (!world.nudged && world.phase === 'clash' && lead && (pileOn || world.blocks === 0)
    && world.round >= (pileOn ? pitchEnd + 1 : Math.ceil((pitchEnd + clash) / 2))) {
    // The member who backs the leader least, else the leader's rival, hears the doubt.
    const m = world.members.find((x) => x.label !== lead.by && !lead.support.has(x.label))
      ?? world.members.find((x) => x.rival === lead.by && x.label !== lead.by);
    if (m) {
      world.nudged = true;
      m.nudge = `${lead.id} "${lead.concept}" is leading${pileOn ? ' and everyone is piling on' : ''}, and it breaks what you push for. Say what it breaks if you believe it.`;
    }
  }
  if (world.phase === 'build' && !world.keyboard && !world.keyboardBroken) {
    out.push({ type: 'note', text: 'The keyboard is free at the workbench.' });
  }
  return out;
}

export function leadingItem(world) {
  const score = (b) => b.support.size - b.blocked.size;
  return [...world.board].sort((a, b) => score(b) - score(a) || a.order - b.order)[0] ?? null;
}

// What one member can see and hear this round, as plain text for its prompt.
export function perceive(world, m) {
  const where = world.members.filter((o) => o.present).map((o) => `${o.label}${o === m ? ' (you)' : ''}: ${o.station}`);
  const heard = world.heard.filter((h) => h.who !== m.label && (h.station === m.station || h.station === 'whiteboard'
    || (h.to && h.to.toLowerCase() === m.label.toLowerCase() && h.station === m.station)));
  const board = world.board.map((b) => `${b.id} "${b.concept}" by ${b.by}: backed by ${[...b.support].join(', ') || 'nobody'}`
    + `${b.blocked.size ? `; blocked by ${[...b.blocked].join(', ')}` : ''}`);
  const news = world.events.filter((e) => e.round <= world.round).map((e) => e.text);
  const lines = [
    `Round ${world.round} of ${world.rounds}. Phase: ${PHASE_RULES[world.phase]}`,
    `Task on the wall: ${world.task}`,
    `Constraint on the wall: ${world.constraint}`,
    `Members (use these labels): ${world.members.map((o) => o.label).join('; ')}. Member 1, ${world.members[0].label}, is the lead.`,
    `Where everyone is: ${where.join('; ')}.`,
    `Your energy: ${m.energy} of ${MAX_ENERGY}.${m.energy === 0 ? ' You can only go to the kitchen and rest.' : ''}`,
    `Your trust: ${Object.entries(m.trust).map(([k, v]) => `${k} ${v > 0 ? '+' : ''}${v}`).join('; ')}.`,
    `Keep an eye on ${m.rival}: what they push for threatens what you push for.`,
    `Board: ${board.length ? board.join(' | ') : 'empty'}.`,
    `Your own board items (you cannot back them): ${world.board.filter((b) => b.by === m.label).map((b) => b.id).join(', ') || 'none'}.${m.proposed ? ' You have used your one proposal.' : ''}`,
    ...(m.said.length ? [`What you already said (do not repeat it): ${m.said.join(' / ')}`] : []),
    `Keyboard: ${world.keyboardBroken ? 'not working this round' : world.keyboard ? `held by ${world.keyboard}` : 'free'}.${world.phase === 'build' ? ` Build progress: ${world.progress}.` : ''}`,
    ...(world.result ? [`The vote chose ${world.result.id} "${world.result.concept}" by ${world.result.by}.`] : []),
    ...(news.length ? [`News: ${news.join(' ')}`] : []),
    ...(m.memory.length ? [`You remember from earlier days this season: ${m.memory.map((x) => x.note).join(' / ')}`] : []),
    ...(m.notes.length ? [`Your notes: ${m.notes.join(' / ')}`] : []),
    ...(m.nudge ? [`A thought nags you: ${m.nudge}`] : []),
    heard.length ? `You heard last round:\n${heard.map((h) => `- ${h.who}${h.to && h.to !== 'all' ? ` to ${h.to}` : ''}: ${h.text}`).join('\n')}` : 'You heard nothing last round.',
  ];
  return lines.join('\n');
}

const STATION_FOR = { pitch: 'whiteboard', propose: 'whiteboard', vote: 'whiteboard', type: 'workbench', rest: 'kitchen' };

// Applies one member's answer. Rules the member broke turn into a "refused" note in the log,
// never an exception. Returns the events to log.
export function applyTurn(world, m, turn) {
  const out = [];
  const beats = [];
  const log = (e) => out.push({ who: m.label, ...e });
  if (turn.thought) log({ type: 'think', text: turn.thought });
  let move = MOVES.includes(turn.move) ? turn.move : 'stay';
  if (m.energy === 0) move = 'kitchen';
  if (move !== 'stay' && move !== m.station) {
    if (m.station === 'workbench' && world.keyboard === m.label) { world.keyboard = null; log({ type: 'keyboard', text: `${m.label} lets go of the keyboard.` }); }
    log({ type: 'move', from: m.station, to: move });
    m.station = move;
  }
  let act = ACTS.includes(turn.act) ? turn.act : 'none';
  if (m.energy === 0 && act !== 'rest') act = 'rest';
  const need = STATION_FOR[act];
  const refuse = (why) => { log({ type: 'refused', act, text: why }); act = 'none'; };
  if (need && m.station !== need) refuse(`${act} needs the ${need}`);
  const item = world.board.find((b) => b.id.toLowerCase() === String(turn.target ?? '').trim().toLowerCase());
  if (act === 'pitch') {
    if (m.pitched) refuse('already pitched');
    else if (!['pitch', 'clash'].includes(world.phase)) refuse('pitching is over');
    else if (world.board.length >= BOARD_SLOTS) refuse('the board is full');
    else {
      const b = addItem(world, m, turn.concept, turn.say?.text, 'pitch');
      m.pitched = true;
      log({ type: 'act', act, target: b.id, concept: b.concept });
    }
  } else if (act === 'propose') {
    if (m.proposed) refuse('you already proposed today');
    else if (world.phase !== 'clash') refuse('proposals happen during Clash');
    else if (world.board.length >= BOARD_SLOTS) refuse('the board is full');
    else {
      const b = addItem(world, m, turn.concept, turn.say?.text, 'propose');
      m.proposed = true;
      log({ type: 'act', act, target: b.id, concept: b.concept });
      beats.push({ type: 'beat', why: 'proposal', who: m.label, text: `${m.label} proposes ${b.concept}` });
    }
  } else if (act === 'back' || act === 'block') {
    if (!item) refuse(`no board item ${turn.target ?? ''}`.trim());
    else if (item.by === m.label) refuse(`cannot ${act} your own idea`);
    else {
      const owner = byLabel(world, item.by);
      const before = owner.trust[m.label];
      if (act === 'back') { item.support.add(m.label); item.blocked.delete(m.label); }
      else { item.blocked.add(m.label); item.support.delete(m.label); world.blocks++; }
      owner.trust[m.label] = clampTrust(before + (act === 'back' ? 1 : -1));
      log({ type: 'act', act, target: item.id, concept: item.concept, owner: item.by });
      log({ type: 'trust', of: owner.label, toward: m.label, value: owner.trust[m.label] });
      if (act === 'block') beats.push({ type: 'beat', why: 'block', who: m.label, text: `${m.label} blocks ${item.by}'s ${item.concept}` });
      if (Math.abs(owner.trust[m.label]) >= 2 && Math.abs(before) < 2) {
        beats.push({ type: 'beat', why: 'trust', who: owner.label, text: `${owner.label} ${owner.trust[m.label] > 0 ? 'now trusts' : 'no longer trusts'} ${m.label}` });
      }
    }
  } else if (act === 'vote') {
    if (world.phase !== 'decide') refuse('votes happen during Decide');
    else if (!item) refuse(`no board item ${turn.target ?? ''}`.trim());
    else { m.vote = item.id; log({ type: 'vote', target: item.id, concept: item.concept }); }
  } else if (act === 'type') {
    if (world.phase !== 'build') refuse('building happens during Build');
    else if (world.keyboardBroken) refuse('the keyboard is not working');
    else if (world.keyboard && world.keyboard !== m.label) refuse(`${world.keyboard} holds the keyboard`);
    else {
      if (!world.keyboard) { world.keyboard = m.label; log({ type: 'keyboard', text: `${m.label} takes the keyboard.` }); beats.push({ type: 'beat', why: 'keyboard', who: m.label, text: `${m.label} takes the keyboard` }); }
      world.progress++;
      log({ type: 'act', act, progress: world.progress });
    }
  } else if (act === 'rest') {
    m.energy = Math.min(MAX_ENERGY, m.energy + 2);
    log({ type: 'act', act, energy: m.energy });
  }
  if (turn.say?.text) {
    m.said.push(turn.say.text); if (m.said.length > 3) m.said.shift();
    const to = turn.say.to && byLabel(world, turn.say.to) ? byLabel(world, turn.say.to).label : 'all';
    log({ type: 'say', to, station: m.station, text: turn.say.text, act });
  }
  if (turn.note) { m.notes.push(turn.note); if (m.notes.length > 6) m.notes.shift(); }
  if (turn.mood) m.mood = String(turn.mood).split(/\s+/)[0].toLowerCase().slice(0, 20);
  log({ type: 'state', mood: m.mood, energy: m.energy, station: m.station });
  // Beats come last, so a viewer can tie each one to the line that caused it.
  return [...out, ...beats];
}

function addItem(world, m, concept, text, kind) {
  const b = {
    id: `P${world.board.length + 1}`, by: m.label, concept: String(concept || `${m.label}'s idea`).slice(0, 60),
    text: String(text ?? ''), kind, order: world.board.length, support: new Set([m.label]), blocked: new Set(),
  };
  world.board.push(b);
  return b;
}

// Ends a round: speech becomes what members heard, energy drains, the vote is counted.
export function endRound(world, roundEvents) {
  const out = [];
  world.heard = roundEvents.filter((e) => e.type === 'say').map((e) => ({ who: e.who, to: e.to, station: e.station, text: e.text }));
  for (const m of world.members) {
    delete m.nudge;
    if (world.round % 4 === 0 && m.energy > 0) {
      m.energy--;
      if (m.energy === 0) out.push({ type: 'beat', why: 'tired', who: m.label, text: `${m.label} runs out of energy` });
    }
  }
  const decideEnd = phaseEnds(world.rounds).find(([p]) => p === 'decide')[1];
  if (world.round === decideEnd) out.push(...countVotes(world));
  return out;
}

export function countVotes(world) {
  const lead = world.members[0];
  const tally = new Map(world.board.map((b) => [b.id, 0]));
  for (const m of world.members) if (m.vote && tally.has(m.vote)) tally.set(m.vote, tally.get(m.vote) + 1);
  // Members who did not vote fall back to the item they backed last, then their own pitch.
  for (const m of world.members) {
    if (m.vote) continue;
    const pick = [...world.board].reverse().find((b) => b.support.has(m.label));
    if (pick) { m.vote = pick.id; tally.set(pick.id, tally.get(pick.id) + 1); }
  }
  const best = Math.max(0, ...tally.values());
  const top = [...tally].filter(([, v]) => v === best).map(([k]) => k);
  let id = top[0];
  let tie = false;
  if (top.length > 1) {
    tie = true;
    id = top.includes(lead.vote) ? lead.vote : top.find((t) => world.board.find((b) => b.id === t).by === lead.label) ?? top[0];
  }
  const b = world.board.find((x) => x.id === id);
  if (!b) return [];
  world.result = { id: b.id, concept: b.concept, by: b.by, votes: tally.get(b.id), tie, tally: Object.fromEntries(tally) };
  return [
    { type: 'result', ...world.result },
    { type: 'beat', why: 'vote', text: `The vote picks ${b.concept} by ${b.by}${tie ? ', the lead breaks a tie' : ''}` },
  ];
}

// A plain snapshot for the log header and the viewer.
export function snapshot(world) {
  return {
    members: world.members.map((m) => ({
      n: m.n, label: m.label, method: m.method, stance: m.stance, temperament: m.temperament,
      guest: m.guest, historical: m.historical, rival: m.rival, energy: m.energy, mood: m.mood,
      station: m.station, trust: { ...m.trust }, notes: [...m.notes],
    })),
    board: world.board.map((b) => ({ id: b.id, by: b.by, concept: b.concept, text: b.text, kind: b.kind, support: [...b.support], blocked: [...b.blocked] })),
    result: world.result, progress: world.progress,
  };
}
