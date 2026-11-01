// The look of a studio day, as safe data. The model designs a look (sim/look.mjs); this file
// checks it, fills gaps from defaults, and never lets markup through: colours must be hex,
// names come from fixed lists, and drawn parts are SVG path data only. The viewer draws the
// result with a fixed puppet rig, so every look animates the same way.
import { seededRandom } from './world.mjs';

export const BODIES = ['biped', 'quadruped', 'many-legged', 'floating', 'rolling', 'plant'];
export const TRAITS = ['hat', 'shell', 'lens', 'apron', 'scarf', 'antenna', 'tail', 'wings', 'cape', 'goggles', 'crown', 'pack'];
export const LIGHTS = ['left', 'right', 'top'];
export const TIMES = ['morning', 'noon', 'evening', 'night'];
export const STATION_NAMES = ['whiteboard', 'workbench', 'wall', 'kitchen', 'door'];
const MAX_PATH = 600;
// Owner's clean modern accents (prompt.md "Build a component"), light and dark forms.
const ACCENTS = [['#c43d12', '#ff6b3d'], ['#8a6400', '#f2b705'], ['#0b7a66', '#3cc4a8'], ['#c8102e', '#ff4d5e'], ['#4b6e12', '#a6d36b'], ['#c2185b', '#ff7aa8']];

// Members from parseTeam carry role; members from the sim carry label.
const cast = (members) => members.map((m) => ({ ...m, label: m.label ?? m.role }));

export const isHex = (c) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);

// Path data only: commands and numbers, inside a box, under a size limit. Anything else is dropped.
export function sanitizePath(d, box = 24) {
  if (typeof d !== 'string') return '';
  const s = d.trim();
  if (!s || s.length > MAX_PATH || !/^[MmLlHhVvCcSsQqTtAaZz0-9.,\s-]+$/.test(s) || !/^[Mm]/.test(s)) return '';
  const nums = (s.match(/-?\d*\.?\d+/g) ?? []).map(Number);
  if (nums.some((n) => !Number.isFinite(n) || n < -box || n > box * 2)) return '';
  return s.replace(/\s+/g, ' ');
}

function lum(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

export function contrast(a, b) {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

function hsl(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s, l };
}

// The owner's clean modern rule, as far as code can check it: no neon, no beige or cream grounds.
export function colourProblem(hex, ground = false) {
  const { h, s, l } = hsl(hex);
  const ch = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  // Neon: a channel at full and another near zero, outside the saffron and amber hues.
  if (s > 0.9 && Math.max(...ch) >= 0xf0 && Math.min(...ch) <= 0x20 && !(h > 20 && h < 60)) return 'neon';
  if (ground && h >= 25 && h <= 55 && s >= 0.15 && l >= 0.7 && l < 0.97) return 'beige or cream ground';
  return '';
}

const traitsOf = (x, d) => {
  const t = [...new Set((Array.isArray(x.traits) ? x.traits : []).filter((v) => TRAITS.includes(v)))].slice(0, 3);
  return t.length ? t : d.traits;
};
const pick = (v, list, fallback) => (list.includes(v) ? v : fallback);
const text = (v, n = 30) => String(v ?? '').replace(/[<>&"'`\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, n);

// A body plan from the member's nature, when the model gives none.
export function guessBody(m) {
  const s = `${m.label} ${m.guest?.kind ?? ''}`.toLowerCase();
  if (/crab|spider|beetle|insect|octop|centipede|scorpion|lobster/.test(s)) return 'many-legged';
  if (/fox|wolf|dog|cat|horse|deer|hare|bear|lion|goat/.test(s)) return 'quadruped';
  if (/tree|fern|moss|flower|vine|mycel|plant|fung/.test(s)) return 'plant';
  if (/wheel|robot|cart|machine|automaton|drone/.test(s)) return 'rolling';
  if (/ghost|spirit|cloud|wind|tide|archetype|future|light|echo/.test(s) || ['archetype', 'future'].includes(m.guest?.kind)) return 'floating';
  return 'biped';
}

export function guessTraits(m) {
  const s = m.label.toLowerCase();
  const t = [];
  if (/camera|photo|film|optic|lens/.test(s)) t.push('lens');
  if (/crab|turtle|snail/.test(s)) t.push('shell');
  if (/cook|chef|baker|maker|smith|potter|cabinet|carpenter|tailor/.test(s)) t.push('apron');
  if (/pilot|engineer|welder|diver/.test(s)) t.push('goggles');
  if (/signal|radio|antenna/.test(s)) t.push('antenna');
  if (/king|queen|emperor|crown/.test(s)) t.push('crown');
  if (/walker|guide|wayfinding|hiker|courier/.test(s)) t.push('pack');
  if (!t.length) t.push(TRAITS[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % 4 === 0 ? 0 : 4]);
  return t.slice(0, 2);
}

export function defaultLook(members, date) {
  members = cast(members);
  const rnd = seededRandom(date, 10);
  const dark = rnd() % 2 === 0;
  const start = rnd() % ACCENTS.length;
  return {
    set: {
      floor: dark ? '#16171a' : '#f2f2f0', wall: dark ? '#0e0f11' : '#e4e4e1', ink: dark ? '#f2f2f0' : '#121316',
      accent: ACCENTS[start][dark ? 1 : 0],
      light: LIGHTS[rnd() % LIGHTS.length], time: dark ? 'evening' : 'morning',
      objects: { whiteboard: 'Whiteboard', workbench: 'Workbench', wall: 'Pin wall', kitchen: 'Kitchen', door: 'Door' }, paths: {},
    },
    members: members.map((m, i) => {
      const acc = ACCENTS[(start + 1 + i) % ACCENTS.length][dark ? 1 : 0];
      return {
        label: m.label, body: guessBody(m), scale: 1, palette: [acc, dark ? '#3a3c42' : '#c9cbcf', dark ? '#f2f2f0' : '#121316'],
        traits: guessTraits(m), prop: '', propPath: '', moods: {},
      };
    }),
  };
}

// Checks a model look against the cast. Returns problems; normalizeLook still repairs what it can.
export function lookProblems(raw, members) {
  members = cast(members);
  const p = [];
  if (!raw || typeof raw !== 'object') return ['look is not an object'];
  const set = raw.set ?? {};
  for (const k of ['floor', 'wall', 'ink']) if (!isHex(set[k])) p.push(`set.${k} must be a #rrggbb colour`);
  for (const k of ['floor', 'wall']) if (isHex(set[k]) && colourProblem(set[k], true)) p.push(`set.${k} is ${colourProblem(set[k], true)}`);
  const list = Array.isArray(raw.members) ? raw.members : [];
  for (const m of members) {
    const x = list.find((y) => String(y?.label ?? '').toLowerCase() === m.label.toLowerCase());
    if (!x) { p.push(`no look for ${m.label}`); continue; }
    if (!BODIES.includes(x.body)) p.push(`${m.label}: body must be one of ${BODIES.join(', ')}`);
    const pal = Array.isArray(x.palette) ? x.palette : [];
    if (!isHex(pal[0])) p.push(`${m.label}: palette needs #rrggbb colours`);
    else {
      if (isHex(set.floor) && contrast(pal[0], set.floor) < 1.8) p.push(`${m.label}: main colour does not stand out from the floor`);
      if (colourProblem(pal[0])) p.push(`${m.label}: main colour is ${colourProblem(pal[0])}`);
    }
    if (x.propPath && !sanitizePath(x.propPath)) p.push(`${m.label}: propPath must be plain path data in a 24 box`);
  }
  const sig = list.map((x) => `${x?.body}|${(x?.traits ?? []).slice().sort().join(',')}`);
  if (new Set(sig).size < sig.length) p.push('two members look the same: change a body plan or traits');
  return p;
}

// A safe, complete look: model values where they pass, defaults where they do not.
export function normalizeLook(raw, members, date) {
  members = cast(members);
  const base = defaultLook(members, date);
  const set = raw?.set ?? {};
  const floor = isHex(set.floor) && !colourProblem(set.floor, true) ? set.floor : base.set.floor;
  const out = {
    set: {
      floor,
      wall: isHex(set.wall) && !colourProblem(set.wall, true) ? set.wall : base.set.wall,
      ink: isHex(set.ink) && contrast(set.ink, floor) >= 4.5 ? set.ink : (contrast('#121316', floor) > contrast('#f2f2f0', floor) ? '#121316' : '#f2f2f0'),
      accent: isHex(set.accent) && !colourProblem(set.accent) ? set.accent : base.set.accent,
      light: pick(set.light, LIGHTS, base.set.light), time: pick(set.time, TIMES, base.set.time),
      objects: Object.fromEntries(STATION_NAMES.map((k) => [k, text(set.objects?.[k], 24) || base.set.objects[k]])),
      paths: Object.fromEntries(STATION_NAMES.map((k) => [k, sanitizePath(set.paths?.[k])]).filter(([, v]) => v)),
    },
    members: [],
  };
  const list = Array.isArray(raw?.members) ? raw.members : [];
  out.members = members.map((m, i) => {
    const d = base.members[i];
    const x = list.find((y) => String(y?.label ?? '').toLowerCase() === m.label.toLowerCase()) ?? {};
    const pal = (Array.isArray(x.palette) ? x.palette : []).filter(isHex).slice(0, 3);
    const main = pal[0] && contrast(pal[0], floor) >= 1.8 && !colourProblem(pal[0]) ? pal[0] : d.palette[0];
    return {
      label: m.label,
      body: pick(x.body, BODIES, d.body),
      scale: Number.isFinite(Number(x.scale)) ? Math.max(0.7, Math.min(1.3, Number(x.scale))) : 1,
      palette: [main, pal[1] ?? d.palette[1], pal[2] ?? d.palette[2]],
      traits: traitsOf(x, d),
      prop: text(x.prop, 24), propPath: sanitizePath(x.propPath),
      moods: { happy: text(x.moods?.happy, 60), upset: text(x.moods?.upset, 60) },
    };
  });
  // Four members that look alike defeat the point: vary the later ones.
  const seen = new Set();
  for (const m of out.members) {
    let sig = `${m.body}|${m.traits.slice().sort().join(',')}`;
    for (let k = 0; seen.has(sig) && k < TRAITS.length; k++) {
      const extra = TRAITS.find((t) => !m.traits.includes(t));
      m.traits = [...m.traits.slice(0, 2), extra];
      sig = `${m.body}|${m.traits.slice().sort().join(',')}`;
    }
    seen.add(sig);
  }
  return out;
}
