// This bridge exists only inside sandboxed comparison previews, never in source artifacts.
// Exercise the original handlers at wall-clock speed, with no animation time manipulation.
export function demoBootstrap() {
  const memory = new Map();
  // srcdoc has an opaque origin. Give every preview its own fresh, volatile store.
  Object.defineProperty(window, 'localStorage', { configurable: true, value: {
    getItem: (k) => memory.has(String(k)) ? memory.get(String(k)) : null,
    setItem: (k, v) => memory.set(String(k), String(v)), removeItem: (k) => memory.delete(String(k)),
    clear: () => memory.clear(), key: (n) => [...memory.keys()][n] ?? null,
    get length() { return memory.size; },
  } });
  // Synthetic pointers have no native capture. Preserve handlers that request it.
  const capture = Element.prototype.setPointerCapture;
  Element.prototype.setPointerCapture = function (id) { try { capture.call(this, id); } catch {} };
  let jobs = [];
  const later = (fn, ms) => jobs.push(setTimeout(fn, ms));
  const send = (data) => parent.postMessage({ type: 'comparison:state', ...data }, '*');
  window.addEventListener('error', (e) => send({ error: e.message }));
  window.addEventListener('message', (e) => {
    if (e.source !== parent || e.data?.type !== 'comparison:demo') return;
    jobs.forEach(clearTimeout); jobs = [];
    const root = document.querySelector('[role][aria-label]') || document.querySelector('button,canvas') || document.body;
    const target = root.querySelector('canvas,button,input') || root;
    const key = (type, value) => root.dispatchEvent(new KeyboardEvent(type, { key: value,
      code: value === ' ' ? 'Space' : value, bubbles: true, cancelable: true }));
    const pointer = (type, x, y, buttons = 0) => {
      const b = root.getBoundingClientRect();
      target.dispatchEvent(new PointerEvent(type, { clientX: b.left + b.width * x,
        clientY: b.top + b.height * y, pointerId: 1, pointerType: 'mouse',
        buttons, button: 0, isPrimary: true, bubbles: true, cancelable: true }));
    };
    if (!e.data.play) { key('keyup', ' '); pointer('pointerup', .7, .6); return; }
    const duration = e.data.seconds * 1000;
    const input = e.data.input || 'tap';
    const state = (phase) => send({ phase, value: root.getAttribute('aria-valuenow'), text: root.getAttribute('aria-valuetext') });
    later(() => state('rest'), 100);
    later(() => {
      if (/hold/.test(input)) { key('keydown', 'ArrowRight'); key('keydown', ' '); }
      else if (/wheel|scrub/.test(input)) {
        [0, 180, 360].forEach((d) => later(() => target.dispatchEvent(new WheelEvent('wheel',
          { deltaY: 90, bubbles: true, cancelable: true })), d));
      } else if (/drag|fling/.test(input)) {
        pointer('pointerdown', .3, .4, 1);
        const steps = /fling/.test(input) ? 8 : 28;
        for (let j = 1; j <= steps; j++) later(() => pointer('pointermove', .3 + .4 * j / steps,
          .4 + .22 * j / steps, 1), j * (/fling/.test(input) ? 18 : 40));
        later(() => pointer('pointerup', .7, .62), steps * (/fling/.test(input) ? 18 : 40) + 30);
      } else if (/nearness|hover/.test(input)) {
        // Enter is the shared accessible equivalent of moving onto a vat; model layouts differ.
        key('keydown', 'Enter'); key('keyup', 'Enter');
      } else { key('keydown', 'Enter'); key('keyup', 'Enter'); }
      state('action');
    }, 500);
    later(() => {
      key('keyup', ' ');
      pointer('pointerup', .7, .6);
      pointer('pointerleave', .7, .6);
      state('settle');
    }, duration - 1100);
    later(() => state('done'), duration - 100);
  });
  window.addEventListener('DOMContentLoaded', () => send({ phase: 'ready' }));
}
