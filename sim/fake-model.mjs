// A scripted stand-in for a model, for tests and offline demos. It reads the round's prompt
// and answers with a plausible member turn, so the whole sim runs with no network.
export function fakeComplete({ costUsd = 0.001 } = {}) {
  let n = 0;
  return async (messages) => {
    n++;
    const sys = messages[0].content;
    const user = messages.at(-1).content;
    const me = sys.match(/You are: (.+)/)?.[1] ?? '';
    const label = (user.match(/^Where everyone is: (.+)$/m)?.[1] ?? '').split('; ').find((x) => x.includes('(you)'))?.split(' (you)')[0] ?? me.split(' (')[0];
    const phase = (user.match(/Phase: (\w+)/)?.[1] ?? '') + '.';
    const board = [...user.matchAll(/\b(P\d+) "([^"]+)" by ([^:]+):/g)].map((m) => ({ id: m[1], by: m[3] }));
    const others = board.filter((b) => b.by !== label);
    const pick = others[n % Math.max(1, others.length)];
    const text = (t) => JSON.stringify(t);
    if (/Studio interview/.test(sys) || /"day":/.test(sys) && /Answer three questions/.test(sys)) return { text: text({ day: 'A long day at the board.', lost: 'My first idea, to the lead.', trust: 'The lead, who listened.' }), model: 'fake', costUsd };
    if (/One change|Give the lead one change/.test(sys)) return { text: text({ say: 'Make the first screen calmer.', change: 'Remove the second heading.' }), model: 'fake', costUsd };
    if (/Studio scribe|write up a studio session/.test(user)) return { text: '## Decision\n\nThe team builds a quiet panel that shows one failed step.\n\nConcept: Quiet Panel\n\n## Build notes\n\n1. One. 2. Two. 3. Three.', model: 'fake', costUsd };
    const turn = { thought: `I watch the room from the ${phase}.`, say: null, move: 'stay', act: 'none', note: `Round ${n}.`, mood: 'focused' };
    if (phase === 'Arrive.') Object.assign(turn, { move: 'wall', say: { to: 'all', text: 'Morning. The task is on the wall.' } });
    if (phase === 'Pitch.') Object.assign(turn, { move: 'whiteboard', act: 'pitch', concept: `${label.split(' ')[0]} idea`, say: { to: 'all', text: `I pitch a thing that comes from my hands. It holds one step at a time.` } });
    if (phase === 'Clash.' && pick) Object.assign(turn, { move: 'whiteboard', act: n % 3 ? 'back' : 'block', target: pick.id, say: { to: pick.by, text: n % 3 ? 'I can live with that, if it stays small.' : 'That breaks what I care about. It hides the failure.' } });
    if (phase === 'Decide.' && board[0]) Object.assign(turn, { move: 'whiteboard', act: 'vote', target: board[0].id, say: { to: 'all', text: 'My vote is on the first idea.' } });
    if (phase === 'Build.') Object.assign(turn, { move: 'workbench', act: 'type', say: { to: 'all', text: 'Typing.' } });
    if (phase === 'Wrap.') Object.assign(turn, { move: 'kitchen', act: 'rest', say: { to: 'all', text: 'Good work, all.' } });
    return { text: text(turn), model: 'fake', costUsd };
  };
}
