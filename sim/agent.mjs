// One studio member: its persona prompt, its answer parser, and the checks on its answer.
// A member gets one retry with its problems listed; a second failure keeps it quiet that round.
import { ACTS, MOVES } from './world.mjs';

export const LIMITS = { thought: 40, say: 40, note: 20 };
// Share of the shorter line's words that the other line also uses.
export function overlap(a, b) {
  const w = (s) => new Set(String(s).toLowerCase().match(/[a-z0-9]+/g) ?? []);
  const [x, y] = [w(a), w(b)];
  const n = Math.min(x.size, y.size);
  if (!n) return 0;
  let k = 0;
  for (const t of x) if (y.has(t)) k++;
  return k / n;
}

const words = (s) => String(s ?? '').split(/\s+/).filter(Boolean).length;
// First-person claims of a historical figure's own life. Historical guests play the method only.
const LIFE = /\b(i was born|i died|my (life|lifetime|wife|husband|century|era|voyages?|expeditions?)|in my day|when i (wrote|painted|sailed|discovered|lived|invented))\b/i;

export function who(m) {
  if (!m.guest) return m.label;
  if (m.historical) return `a modern practitioner of the method of ${m.label} (historical guest; ${m.guest.source}). Never speak as ${m.label}, never imitate their voice, and talk only about the method`;
  return `${m.label} (${m.guest.kind} guest; ${m.guest.source})`;
}

export function persona(m, sections) {
  const guest = !m.guest ? ''
    : m.historical ? 'You are a historical guest: plain modern words, about the method only.'
      : 'You are a guest: speak in character, in original words. Never quote or paraphrase a source text.';
  const body = sections['Studio member']
    .replaceAll('{{WHO}}', who(m)).replaceAll('{{METHOD}}', m.method).replaceAll('{{STANCE}}', m.stance)
    .replaceAll('{{TEMPERAMENT}}', m.temperament || 'Your own way.').replaceAll('{{GUEST}}', guest);
  return `${body}\n\nWriting rules:\n\n${sections['Writing rules']}`;
}

export function parseTurn(text) {
  const raw = String(text ?? '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('no JSON object');
  const turn = JSON.parse(raw.slice(start, end + 1));
  if (!turn || typeof turn !== 'object' || Array.isArray(turn)) throw new Error('not a JSON object');
  if (turn.say && typeof turn.say === 'string') turn.say = { to: 'all', text: turn.say };
  if (turn.say && !String(turn.say.text ?? '').trim()) turn.say = null;
  return turn;
}

// Problems with a parsed answer. findBanned comes from run.mjs (it reads prompt.md).
export function turnProblems(turn, m, findBanned) {
  const p = [];
  if (turn.move !== undefined && !MOVES.includes(turn.move)) p.push(`move must be one of ${MOVES.join(', ')}`);
  if (turn.act !== undefined && !ACTS.includes(turn.act)) p.push(`act must be one of ${ACTS.join(', ')}`);
  if (words(turn.thought) > LIMITS.thought) p.push(`thought is over ${LIMITS.thought} words`);
  if (words(turn.say?.text) > LIMITS.say) p.push(`say.text is over ${LIMITS.say} words`);
  if (words(turn.note) > LIMITS.note) p.push(`note is over ${LIMITS.note} words`);
  if ((turn.act === 'pitch' || turn.act === 'propose') && !String(turn.concept ?? '').trim()) p.push(`${turn.act} needs a concept`);
  const text = [turn.thought, turn.say?.text, turn.note, turn.concept].filter(Boolean).join('\n');
  for (const w of findBanned(text)) p.push(`uses the word "${w}"`);
  if (/\p{Extended_Pictographic}/u.test(text)) p.push('uses an emoji');
  if (/!/.test(text)) p.push('uses an exclamation mark');
  if (/(^|[.?]\s+)as an? [a-z][a-z -]{0,40},/im.test(text)) p.push('uses "As a ___"');
  if (m.historical && LIFE.test(text)) p.push('speaks as the historical figure; talk about the method only');
  if (turn.say?.text && (m.said ?? []).some((x) => overlap(x, turn.say.text) > 0.6)) p.push('repeats something you already said; say something new or set say to null');
  return p;
}

// Asks one member for its turn. Returns { turn, problems, idle, model, costUsd }.
export async function takeTurn(ask, m, perception, sections, findBanned) {
  const messages = [{ role: 'system', content: persona(m, sections) }, { role: 'user', content: `${perception}\n\nReturn one JSON object only.` }];
  let costUsd = 0;
  let model = null;
  let problems = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    let out;
    try {
      out = await ask(messages, 600);
    } catch (e) {
      problems = [`call failed: ${e.message}`];
      if (e.budget) throw e;
      continue;
    }
    costUsd += out.costUsd ?? 0;
    model = out.model;
    try {
      const turn = parseTurn(out.text);
      problems = turnProblems(turn, m, findBanned);
      if (!problems.length) return { turn, problems: [], idle: false, model, costUsd };
    } catch (e) {
      problems = [e.message];
    }
    messages.push({ role: 'assistant', content: out.text }, { role: 'user', content: `Fix these problems and return the JSON object again:\n- ${problems.join('\n- ')}` });
  }
  return { turn: null, problems, idle: true, model, costUsd };
}
