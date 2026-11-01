// Studio replay viewer. Inlined into watch.html by sim-view.mjs, with the day's data in an
// application/json script block with the id sim-data. Plain browser JavaScript, no libraries,
// no network (except EventSource in local live mode). Model text only ever goes in via
// textContent; colours and path data are checked again here before use.
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var data = JSON.parse(document.getElementById('sim-data').textContent);
  var HEX = /^#[0-9a-f]{6}$/i;
  var PATH = /^[Mm][MmLlHhVvCcSsQqTtAaZz0-9.,\s-]*$/;
  var hex = function (c, d) { return HEX.test(c || '') ? c : d; };
  var safePath = function (d) { return typeof d === 'string' && d.length < 600 && PATH.test(d) ? d : ''; };
  var reduce = function () { return matchMedia('(prefers-reduced-motion: reduce)').matches; };

  // Stage geometry, in a 1000 x 620 view box. The back wall is the top band.
  var W = 1000, H = 620, WALL = 170;
  var SPOTS = {
    whiteboard: { x: 500, y: 330, label: [500, 40] },
    wall: { x: 185, y: 330, label: [185, 40] },
    door: { x: 870, y: 330, label: [870, 40] },
    workbench: { x: 790, y: 525, label: [790, 610] },
    kitchen: { x: 210, y: 530, label: [210, 610] },
  };
  var OFFSETS = [[-115, 0], [115, 0], [-45, 62], [45, 62], [0, -40]];
  var SIZE = 1.3;

  var look = data.look || { set: {}, members: [] };
  var set = look.set || {};
  var C = {
    floor: hex(set.floor, '#f2f2f0'), wall: hex(set.wall, '#e4e4e1'), ink: hex(set.ink, '#121316'), accent: hex(set.accent, '#c43d12'),
  };
  document.documentElement.style.setProperty('--floor', C.floor);
  document.documentElement.style.setProperty('--wall', C.wall);
  document.documentElement.style.setProperty('--ink', C.ink);
  document.documentElement.style.setProperty('--accent', C.accent);

  function el(tag, attrs, parent) {
    var n = document.createElementNS(NS, tag);
    for (var k in attrs) if (attrs[k] !== undefined && attrs[k] !== null) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function h(tag, cls, parent, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    if (parent) parent.appendChild(n);
    return n;
  }

  // ---- Cast -----------------------------------------------------------------------------
  var members = (data.members || []).map(function (m, i) {
    var lk = (look.members || []).find(function (x) { return x.label === m.label; }) || {};
    var pal = (lk.palette || []).map(function (c) { return hex(c, ''); });
    return {
      n: i + 1, label: m.label, method: m.method, stance: m.stance, temperament: m.temperament, guest: m.guest, historical: m.historical,
      body: lk.body || 'biped', scale: Math.max(0.7, Math.min(1.3, Number(lk.scale) || 1)), traits: lk.traits || [],
      c1: pal[0] || ['#c43d12', '#0b7a66', '#8a6400', '#c2185b'][i % 4], c2: pal[1] || '#c9cbcf', c3: pal[2] || C.ink,
      prop: lk.prop || '', propPath: safePath(lk.propPath), moods: lk.moods || {},
      initials: m.label.split(/\s+/).map(function (w) { return w[0]; }).join('').slice(0, 2).toUpperCase(),
    };
  });
  var byLabel = {};
  members.forEach(function (m) { byLabel[m.label] = m; });

  // ---- Layout ---------------------------------------------------------------------------
  var root = document.getElementById('studio');
  var top = h('header', 'sv-top', root);
  var titles = h('div', 'sv-titles', top);
  h('div', 'sv-kicker', titles, 'Daily team studio · ' + (data.date || ''));
  h('h1', 'sv-title', titles, data.title || 'The studio');
  h('p', 'sv-task', titles, data.task || '');
  var controls = h('div', 'sv-controls', top);
  var playBtn = h('button', 'sv-btn sv-play', controls, 'Play');
  playBtn.type = 'button';
  var prevBtn = h('button', 'sv-btn', controls, 'Back'); prevBtn.type = 'button'; prevBtn.setAttribute('aria-label', 'Previous moment');
  var nextBtn = h('button', 'sv-btn', controls, 'Next'); nextBtn.type = 'button'; nextBtn.setAttribute('aria-label', 'Next moment');
  var speedSel = h('select', 'sv-select', controls); speedSel.setAttribute('aria-label', 'Speed');
  [1, 2, 4].forEach(function (s) { var o = h('option', '', speedSel, s + 'x'); o.value = String(s); });
  var thoughtsBox = toggle(controls, 'Thoughts', true);
  var highlightsBox = toggle(controls, 'Highlights', false);
  function toggle(parent, name, on) {
    var lab = h('label', 'sv-toggle', parent);
    var box = h('input', '', lab); box.type = 'checkbox'; box.checked = on;
    h('span', '', lab, name);
    return box;
  }

  var main = h('main', 'sv-main', root);
  var stageWrap = h('div', 'sv-stage', main);
  var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': 'The studio floor with the four team members' }, stageWrap);
  var side = h('aside', 'sv-side', main);
  var cards = h('div', 'sv-cards', side);
  var feedHead = h('h2', 'sv-h2', side, 'What happened');
  var feed = h('ol', 'sv-feed', side);
  feed.setAttribute('aria-label', 'Transcript so far');
  void feedHead;

  var bar = h('div', 'sv-bar', root);
  var roundLabel = h('div', 'sv-round', bar, '');
  var track = h('div', 'sv-track', bar);
  var marks = h('div', 'sv-marks', track);
  var scrub = h('input', 'sv-scrub', track); scrub.type = 'range'; scrub.min = '0'; scrub.value = '0'; scrub.setAttribute('aria-label', 'Timeline');

  // ---- Stage drawing --------------------------------------------------------------------
  var light = set.light || 'top';
  var shadowDx = light === 'left' ? 10 : light === 'right' ? -10 : 0;
  el('rect', { x: 0, y: 0, width: W, height: H, fill: C.floor }, svg);
  el('rect', { x: 0, y: 0, width: W, height: WALL, fill: C.wall }, svg);
  el('line', { x1: 0, y1: WALL, x2: W, y2: WALL, stroke: C.ink, 'stroke-opacity': 0.25, 'stroke-width': 2 }, svg);
  // Floor boards: quiet hairlines that give the room depth.
  for (var gy = WALL + 50; gy < H; gy += 56) el('line', { x1: 0, y1: gy, x2: W, y2: gy, stroke: C.ink, 'stroke-opacity': 0.06 }, svg);
  if ((set.time || '') === 'night' || (set.time || '') === 'evening') el('rect', { x: 0, y: 0, width: W, height: H, fill: '#000', opacity: set.time === 'night' ? 0.12 : 0.05 }, svg);
  var windowG = el('g', {}, svg);
  el('rect', { x: 300, y: 30, width: 90, height: 70, rx: 4, fill: set.time === 'night' ? '#1c2230' : set.time === 'evening' ? '#d9c7b8' : '#dfe8ee', stroke: C.ink, 'stroke-opacity': 0.3 }, windowG);
  el('line', { x1: 345, y1: 30, x2: 345, y2: 100, stroke: C.ink, 'stroke-opacity': 0.3 }, windowG);

  var objects = set.objects || {};
  var stationNames = { whiteboard: 'Whiteboard', workbench: 'Workbench', wall: 'Pin wall', kitchen: 'Kitchen', door: 'Door' };
  var boardG, monitorG, progressBar, doorFlash, keyboardG;
  function stationLabel(key) {
    var s = SPOTS[key];
    var t = el('text', { x: s.label[0], y: s.label[1], 'text-anchor': 'middle', class: 'sv-slabel' }, svg);
    t.textContent = String(objects[key] || stationNames[key]).slice(0, 24);
  }
  // Whiteboard with board cards.
  el('rect', { x: 360, y: 58, width: 280, height: 96, rx: 6, fill: '#fbfbfa', stroke: C.ink, 'stroke-opacity': 0.4, 'stroke-width': 2 }, svg);
  boardG = el('g', {}, svg);
  // Pin wall.
  el('rect', { x: 110, y: 58, width: 150, height: 96, rx: 4, fill: C.wall, stroke: C.ink, 'stroke-opacity': 0.35, 'stroke-width': 2 }, svg);
  var pins = el('g', {}, svg);
  [[130, 72, 44, 30], [184, 70, 58, 38], [126, 112, 66, 30], [204, 116, 40, 28]].forEach(function (r, i) {
    el('rect', { x: r[0], y: r[1], width: r[2], height: r[3], fill: i === 1 ? C.accent : '#fbfbfa', 'fill-opacity': i === 1 ? 0.25 : 1, stroke: C.ink, 'stroke-opacity': 0.25 }, pins);
  });
  // Door.
  el('rect', { x: 830, y: 52, width: 80, height: 118, rx: 3, fill: C.wall, stroke: C.ink, 'stroke-opacity': 0.45, 'stroke-width': 2 }, svg);
  el('circle', { cx: 898, cy: 116, r: 4, fill: C.ink, 'fill-opacity': 0.5 }, svg);
  doorFlash = el('rect', { x: 830, y: 52, width: 80, height: 118, rx: 3, fill: C.accent, opacity: 0 }, svg);
  // Workbench with monitor and keyboard.
  el('rect', { x: 700, y: 400, width: 190, height: 44, rx: 4, fill: C.wall, stroke: C.ink, 'stroke-opacity': 0.4, 'stroke-width': 2 }, svg);
  monitorG = el('g', {}, svg);
  el('rect', { x: 740, y: 336, width: 110, height: 66, rx: 4, fill: '#121316', stroke: C.ink, 'stroke-opacity': 0.5 }, monitorG);
  el('rect', { x: 750, y: 386, width: 90, height: 6, rx: 3, fill: '#3a3c42' }, monitorG);
  progressBar = el('rect', { x: 750, y: 386, width: 0, height: 6, rx: 3, fill: C.accent }, monitorG);
  keyboardG = el('rect', { x: 760, y: 408, width: 70, height: 12, rx: 3, fill: '#fbfbfa', stroke: C.ink, 'stroke-opacity': 0.4 }, svg);
  // Kitchen counter, kettle and mugs.
  el('rect', { x: 110, y: 410, width: 200, height: 40, rx: 4, fill: C.wall, stroke: C.ink, 'stroke-opacity': 0.4, 'stroke-width': 2 }, svg);
  el('rect', { x: 130, y: 390, width: 26, height: 22, rx: 6, fill: C.ink, 'fill-opacity': 0.7 }, svg);
  el('rect', { x: 250, y: 396, width: 14, height: 16, rx: 3, fill: C.accent }, svg);
  el('rect', { x: 272, y: 396, width: 14, height: 16, rx: 3, fill: '#fbfbfa', stroke: C.ink, 'stroke-opacity': 0.4 }, svg);
  // Model-drawn station objects, path data only, in a 24 box scaled up.
  var objPos = { whiteboard: [610, 100], workbench: [860, 416], wall: [236, 100], kitchen: [200, 392], door: [846, 70] };
  Object.keys(set.paths || {}).forEach(function (k) {
    var d = safePath(set.paths[k]);
    if (!d || !objPos[k]) return;
    el('path', { d: d, transform: 'translate(' + objPos[k][0] + ' ' + objPos[k][1] + ') scale(1.2)', fill: 'none', stroke: C.ink, 'stroke-width': 1.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, svg);
  });
  Object.keys(SPOTS).forEach(stationLabel);

  var actors = el('g', {}, svg);
  var overlay = el('g', {}, svg);

  // ---- The rig --------------------------------------------------------------------------
  // Each member is a puppet: feet at (0, 0), facing right, about 100 units tall. Parts that
  // move are kept so the frame loop can swing legs, bob heads and raise arms.
  function buildActor(m) {
    var g = el('g', { class: 'sv-actor', tabindex: '0', role: 'button', 'aria-label': m.label + ', show details' }, actors);
    var shadow = el('ellipse', { cx: shadowDx, cy: 2, rx: 30, ry: 7, fill: '#000', opacity: 0.12 }, g);
    var flip = el('g', {}, g);
    var body = el('g', {}, flip);
    var parts = { g: g, flip: flip, body: body, shadow: shadow, legs: [], armL: null, armR: null, head: null, mouth: null };
    var c1 = m.c1, c2 = m.c2, c3 = m.c3;
    var stroke = { stroke: c3, 'stroke-width': 2.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
    function leg(x, y1, y2) { var l = el('line', Object.assign({ x1: x, y1: y1, x2: x, y2: y2 }, stroke), body); parts.legs.push(l); return l; }
    function arm(x, y, len) { var a = el('g', { transform: 'translate(' + x + ' ' + y + ')' }, body); el('line', Object.assign({ x1: 0, y1: 0, x2: 0, y2: len }, stroke), a); return a; }
    function head(x, y, r) {
      var hg = el('g', { transform: 'translate(' + x + ' ' + y + ')' }, body);
      el('circle', { r: r, fill: c2, stroke: c3, 'stroke-width': 2.5 }, hg);
      el('circle', { cx: r * 0.4, cy: -r * 0.15, r: 2.2, fill: c3 }, hg);
      parts.mouth = el('line', { x1: r * 0.15, y1: r * 0.4, x2: r * 0.6, y2: r * 0.35, stroke: c3, 'stroke-width': 2, 'stroke-linecap': 'round' }, hg);
      parts.head = hg; parts.headY = y; parts.headX = x; parts.headR = r;
      return hg;
    }
    var b = m.body;
    if (b === 'quadruped') {
      leg(-22, -26, 0); leg(-12, -26, 0); leg(12, -26, 0); leg(22, -26, 0);
      el('ellipse', { cx: 0, cy: -36, rx: 32, ry: 15, fill: c1, stroke: c3, 'stroke-width': 2.5 }, body);
      parts.armL = arm(-30, -40, 0); parts.armR = arm(30, -44, 0);
      head(36, -58, 13);
    } else if (b === 'many-legged') {
      for (var i = 0; i < 3; i++) { leg(-26 + i * 6, -14, 0).setAttribute('x2', -40 + i * 6); leg(14 + i * 6, -14, 0).setAttribute('x2', 28 + i * 6); }
      el('ellipse', { cx: 0, cy: -22, rx: 34, ry: 17, fill: c1, stroke: c3, 'stroke-width': 2.5 }, body);
      el('path', { d: 'M-22 -28 Q0 -44 22 -28', fill: 'none', stroke: c3, 'stroke-opacity': 0.35, 'stroke-width': 2 }, body);
      parts.armL = arm(-30, -26, 0); el('path', Object.assign({ d: 'M0 0 L-12 -14 M-12 -14 L-20 -10 M-12 -14 L-14 -22', fill: 'none' }, stroke), parts.armL);
      parts.armR = arm(30, -26, 0); el('path', Object.assign({ d: 'M0 0 L12 -14 M12 -14 L20 -10 M12 -14 L14 -22', fill: 'none' }, stroke), parts.armR);
      var hg = el('g', { transform: 'translate(0 -40)' }, body);
      el('line', Object.assign({ x1: -8, y1: 0, x2: -10, y2: -14 }, stroke), hg); el('line', Object.assign({ x1: 8, y1: 0, x2: 10, y2: -14 }, stroke), hg);
      el('circle', { cx: -10, cy: -16, r: 4, fill: c2, stroke: c3, 'stroke-width': 2 }, hg); el('circle', { cx: 10, cy: -16, r: 4, fill: c2, stroke: c3, 'stroke-width': 2 }, hg);
      parts.mouth = el('line', { x1: -4, y1: 2, x2: 4, y2: 2, stroke: c3, 'stroke-width': 2, 'stroke-linecap': 'round' }, hg);
      parts.head = hg; parts.headY = -40; parts.headX = 0; parts.headR = 12;
    } else if (b === 'floating') {
      el('path', { d: 'M-20 -40 Q-22 -86 0 -92 Q22 -86 20 -40 Q10 -28 0 -36 Q-10 -28 -20 -40 Z', fill: c1, stroke: c3, 'stroke-width': 2.5 }, body);
      parts.armL = arm(-24, -64, 18); parts.armR = arm(24, -64, 18);
      head(0, -104, 13);
      shadow.setAttribute('rx', 20);
    } else if (b === 'rolling') {
      var wheel = el('g', { transform: 'translate(0 -16)' }, body);
      el('circle', { r: 16, fill: c2, stroke: c3, 'stroke-width': 2.5 }, wheel);
      el('line', Object.assign({ x1: -16, y1: 0, x2: 16, y2: 0 }, stroke), wheel);
      parts.wheel = wheel;
      el('rect', { x: -18, y: -66, width: 36, height: 36, rx: 6, fill: c1, stroke: c3, 'stroke-width': 2.5 }, body);
      parts.armL = arm(-20, -60, 22); parts.armR = arm(20, -60, 22);
      head(0, -80, 13);
    } else if (b === 'plant') {
      el('path', { d: 'M-16 0 L-20 -24 L20 -24 L16 0 Z', fill: c2, stroke: c3, 'stroke-width': 2.5 }, body);
      el('line', Object.assign({ x1: 0, y1: -24, x2: 0, y2: -70 }, stroke), body);
      parts.armL = el('g', { transform: 'translate(0 -46)' }, body); el('path', { d: 'M0 0 Q-20 -4 -26 -18 Q-10 -16 0 0 Z', fill: c1, stroke: c3, 'stroke-width': 2 }, parts.armL);
      parts.armR = el('g', { transform: 'translate(0 -56)' }, body); el('path', { d: 'M0 0 Q20 -4 26 -18 Q10 -16 0 0 Z', fill: c1, stroke: c3, 'stroke-width': 2 }, parts.armR);
      head(0, -82, 14);
      parts.plant = true;
    } else {
      leg(-8, -32, 0); leg(8, -32, 0);
      el('rect', { x: -16, y: -72, width: 32, height: 42, rx: 10, fill: c1, stroke: c3, 'stroke-width': 2.5 }, body);
      parts.armL = arm(-17, -66, 28); parts.armR = arm(17, -66, 28);
      head(0, -86, 14);
    }
    traits(m, parts, body, stroke);
    if (m.propPath && parts.armR) el('path', { d: m.propPath, transform: 'translate(-8 ' + (b === 'plant' ? -26 : 22) + ') scale(0.7)', fill: 'none', stroke: C.ink, 'stroke-width': 2.2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, parts.armR);
    var tag = el('g', { transform: 'translate(0 18)' }, g);
    el('rect', { x: -22, y: -10, width: 44, height: 20, rx: 10, fill: m.c1 }, tag);
    var tt = el('text', { 'text-anchor': 'middle', y: 5, class: 'sv-tag' }, tag); tt.textContent = String(m.n);
    var nm = el('text', { 'text-anchor': 'middle', y: 30, class: 'sv-name' }, tag); nm.textContent = m.label.length > 22 ? m.label.slice(0, 21) + '…' : m.label;
    parts.tagText = tt; parts.name = nm;
    g.setAttribute('transform', 'scale(' + m.scale + ')');
    g.addEventListener('click', function () { focusMember(m.label); });
    g.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); focusMember(m.label); } });
    return parts;
  }

  function traits(m, p, body, stroke) {
    var hx = p.headX || 0, hy = p.headY || -86, r = p.headR || 14, c1 = m.c1, c3 = m.c3;
    m.traits.forEach(function (t) {
      if (t === 'hat') el('path', { d: 'M' + (hx - r - 4) + ' ' + (hy - r + 4) + ' L' + (hx + r + 4) + ' ' + (hy - r + 4) + ' L' + (hx + r - 4) + ' ' + (hy - r - 10) + ' L' + (hx - r + 4) + ' ' + (hy - r - 10) + ' Z', fill: c3 }, p.head ? p.head.parentNode : body).setAttribute('transform', '');
      if (t === 'crown') el('path', { d: 'M' + (hx - 10) + ' ' + (hy - r) + ' L' + (hx - 10) + ' ' + (hy - r - 12) + ' L' + (hx - 4) + ' ' + (hy - r - 5) + ' L' + hx + ' ' + (hy - r - 14) + ' L' + (hx + 4) + ' ' + (hy - r - 5) + ' L' + (hx + 10) + ' ' + (hy - r - 12) + ' L' + (hx + 10) + ' ' + (hy - r) + ' Z', fill: C.accent, stroke: c3, 'stroke-width': 1.5 }, body);
      if (t === 'goggles') { el('circle', { cx: hx + 3, cy: hy - 3, r: 5, fill: 'none', stroke: c3, 'stroke-width': 2.5 }, body); el('circle', { cx: hx + 12, cy: hy - 3, r: 4, fill: 'none', stroke: c3, 'stroke-width': 2.5 }, body); }
      if (t === 'lens') { var lg = el('g', { transform: 'translate(' + (hx + r + 4) + ' ' + (hy) + ')' }, body); el('rect', { x: -2, y: -6, width: 12, height: 12, rx: 2, fill: c3 }, lg); el('circle', { cx: 12, cy: 0, r: 5, fill: '#fbfbfa', stroke: c3, 'stroke-width': 2 }, lg); p.lens = lg; }
      if (t === 'antenna') { el('line', Object.assign({ x1: hx, y1: hy - r, x2: hx + 6, y2: hy - r - 18 }, stroke), body); el('circle', { cx: hx + 6, cy: hy - r - 20, r: 3.5, fill: C.accent }, body); }
      if (t === 'scarf') el('path', { d: 'M' + (hx - 12) + ' ' + (hy + r) + ' Q' + hx + ' ' + (hy + r + 6) + ' ' + (hx + 12) + ' ' + (hy + r) + ' L' + (hx - 6) + ' ' + (hy + r + 18) + ' Z', fill: C.accent }, body);
      if (t === 'apron') el('rect', { x: -10, y: hy + r + 14, width: 20, height: 26, rx: 3, fill: '#fbfbfa', stroke: c3, 'stroke-width': 1.5 }, body);
      if (t === 'pack') el('rect', { x: -26, y: hy + r + 6, width: 12, height: 26, rx: 4, fill: c3, 'fill-opacity': 0.75 }, body).parentNode.insertBefore(body.lastChild, body.firstChild);
      if (t === 'cape') { var cp = el('path', { d: 'M-14 ' + (hy + r + 4) + ' L-24 ' + (hy + r + 52) + ' L4 ' + (hy + r + 52) + ' Z', fill: C.accent, 'fill-opacity': 0.8 }, body); body.insertBefore(cp, body.firstChild); }
      if (t === 'wings') { var wg = el('g', {}, body); el('ellipse', { cx: -22, cy: hy + r + 16, rx: 16, ry: 8, fill: '#fbfbfa', stroke: c3, 'stroke-width': 1.5, transform: 'rotate(-30 -22 ' + (hy + r + 16) + ')' }, wg); body.insertBefore(wg, body.firstChild); p.wings = wg; }
      if (t === 'tail') { var tl = el('path', { d: 'M-18 -30 Q-40 -30 -38 -52', fill: 'none', stroke: c1, 'stroke-width': 5, 'stroke-linecap': 'round' }, body); body.insertBefore(tl, body.firstChild); p.tail = tl; }
      if (t === 'shell') el('path', { d: 'M-26 -26 Q-24 -52 0 -54 Q24 -52 26 -26 Z', fill: C.accent, 'fill-opacity': 0.85, stroke: c3, 'stroke-width': 2 }, body);
    });
  }

  var actorState = {};
  members.forEach(function (m, i) {
    var parts = buildActor(m);
    var start = SPOTS.door;
    actorState[m.label] = {
      parts: parts, m: m, x: start.x + OFFSETS[i][0], y: start.y + OFFSETS[i][1], tx: start.x + OFFSETS[i][0], ty: start.y + OFFSETS[i][1],
      station: 'door', facing: 1, talk: 0, mood: 'curious', energy: 5, present: true, celebrate: 0, slump: 0, phase: Math.random() * 6,
    };
  });

  // ---- Steps: the playable timeline ------------------------------------------------------
  var events = (data.events || []).slice();
  var steps = [];
  var beatsAt = [];
  function isHighlight(s) {
    var e = s.e;
    return e.type === 'event' || e.type === 'result' || e.type === 'interview' || e.type === 'phaseCard' && s.beat
      || (e.type === 'say' && /^(pitch|block|propose|vote|review)$/.test(e.act || '')) || e.type === 'beat';
  }
  function buildSteps() {
    steps = [];
    beatsAt = [];
    var lastRound = -1;
    var pendingMoves = [];
    var roundBeat = {};
    events.forEach(function (e) { if (e.type === 'beat') roundBeat[e.r] = true; });
    function flushMoves() { if (pendingMoves.length) { steps.push({ kind: 'moves', moves: pendingMoves, e: { type: 'moves', r: pendingMoves[0].r } }); pendingMoves = []; } }
    events.forEach(function (e) {
      if (e.type === 'phase') { flushMoves(); steps.push({ kind: 'card', e: { type: 'phaseCard', r: e.r, text: e.text, phase: e.phase }, beat: roundBeat[e.r] }); lastRound = e.r; return; }
      if (e.type === 'move') { pendingMoves.push(e); return; }
      if (e.type === 'state' || e.type === 'trust' || e.type === 'keyboard' || e.type === 'act' || e.type === 'refused' || e.type === 'idle') {
        if (steps.length) (steps[steps.length - 1].quiet = steps[steps.length - 1].quiet || []).push(e);
        else steps.push({ kind: 'quiet', e: e, quiet: [e] });
        return;
      }
      if (e.type === 'beat') { if (steps.length) { steps[steps.length - 1].beat = true; steps[steps.length - 1].beatText = e.text; beatsAt.push(steps.length - 1); } return; }
      flushMoves();
      steps.push({ kind: e.type, e: e });
    });
    flushMoves();
    void lastRound;
    scrub.max = String(Math.max(0, steps.length - 1));
    drawMarks();
  }
  function drawMarks() {
    while (marks.firstChild) marks.removeChild(marks.firstChild);
    var n = Math.max(1, steps.length - 1);
    beatsAt.forEach(function (i) { var d = h('span', 'sv-mark', marks); d.style.left = (100 * i / n) + '%'; });
  }

  // ---- World state, replayed from steps --------------------------------------------------
  var S;
  function resetState() {
    S = { board: [], trust: {}, keyboard: null, progress: 0, result: null, round: 0, phase: 'arrive', interviews: {}, notes: {} };
    members.forEach(function (m, i) {
      var a = actorState[m.label];
      a.station = 'door'; a.mood = 'curious'; a.energy = 5; a.celebrate = 0; a.slump = 0; a.talk = 0;
      a.x = a.tx = SPOTS.door.x + OFFSETS[i][0]; a.y = a.ty = SPOTS.door.y + OFFSETS[i][1];
      S.trust[m.label] = {};
    });
    (data.lateGuests || []).forEach(function (l) { if (actorState[l]) actorState[l].present = false; });
    while (feed.firstChild) feed.removeChild(feed.firstChild);
    clearBubbles();
  }
  function spot(label) {
    var a = actorState[label];
    var same = members.filter(function (m) { return actorState[m.label].station === a.station; });
    var k = Math.max(0, same.findIndex(function (m) { return m.label === label; }));
    var s = SPOTS[a.station] || SPOTS.door;
    return { x: s.x + OFFSETS[k % OFFSETS.length][0], y: s.y + OFFSETS[k % OFFSETS.length][1] };
  }
  function applyQuiet(e) {
    var a = e.who && actorState[e.who];
    if (e.type === 'state' && a) { a.mood = e.mood || a.mood; a.energy = e.energy; }
    if (e.type === 'trust' && S.trust[e.of]) S.trust[e.of][e.toward] = e.value;
    if (e.type === 'keyboard') S.keyboard = /takes/.test(e.text || '') ? e.who : null;
    if (e.type === 'act' && e.act === 'type') S.progress = e.progress || S.progress;
    if (e.type === 'act' && (e.act === 'pitch' || e.act === 'propose')) S.board.push({ id: e.target, by: e.who, concept: e.concept, support: 1, blocked: 0 });
    if (e.type === 'act' && (e.act === 'back' || e.act === 'block')) {
      var b = S.board.find(function (x) { return x.id === e.target; });
      if (b) { if (e.act === 'back') b.support++; else b.blocked++; }
      if (a && e.act === 'block') a.slump = 0;
    }
    if (e.type === 'idle' && a) a.mood = 'quiet';
  }
  function applyStep(s, instant) {
    var e = s.e;
    if (s.kind === 'card') { S.round = e.r; S.phase = e.phase; }
    if (s.kind === 'moves') {
      s.moves.forEach(function (mv) { var a = actorState[mv.who]; if (a) { a.station = mv.to; a.present = true; } });
      members.forEach(function (m) { var a = actorState[m.label]; var p = spot(m.label); a.tx = p.x; a.ty = p.y; if (instant || reduce()) { a.x = p.x; a.y = p.y; } });
    }
    if (s.kind === 'event' && e.kind === 'late' && actorState[e.target]) actorState[e.target].present = true;
    if (s.kind === 'result') {
      S.result = e;
      var winner = actorState[e.by]; if (winner) winner.celebrate = instant ? 0 : 1;
    }
    if (s.kind === 'interview') S.interviews[e.who] = e;
    (s.quiet || []).forEach(applyQuiet);
    if (s.kind === 'say' || s.kind === 'think' || s.kind === 'event' || s.kind === 'result' || s.kind === 'interview' || s.kind === 'card' || s.kind === 'build') addFeed(s);
  }

  // ---- Transcript and cards --------------------------------------------------------------
  function addFeed(s) {
    var e = s.e;
    if (s.kind === 'think' && !thoughtsBox.checked) return;
    var li = h('li', 'sv-line sv-' + s.kind, feed);
    if (s.kind === 'card') { li.textContent = 'Round ' + e.r + ' · ' + (e.text || '').split('.')[0]; return; }
    if (s.kind === 'event') { li.textContent = e.text; return; }
    if (s.kind === 'result') { li.textContent = 'The vote picks ' + e.concept + ' by ' + e.by + (e.tie ? '. The lead breaks a tie.' : '.'); return; }
    if (s.kind === 'build') { li.textContent = e.text; return; }
    var m = byLabel[e.who];
    var chip = h('span', 'sv-chip', li, m ? String(m.n) : '');
    if (m) chip.style.background = m.c1;
    var who = h('strong', '', li, e.who + (e.to && e.to !== 'all' ? ' to ' + e.to : ''));
    void who;
    if (s.kind === 'interview') { h('span', '', li, ' · after the day: ' + e.day + ' Lost: ' + e.lost + ' Trusts: ' + e.trust); return; }
    h('span', '', li, s.kind === 'think' ? ' thinks: ' + e.text : ': ' + e.text);
    if (s.beatText) h('em', 'sv-beat', li, s.beatText);
    feed.scrollTop = feed.scrollHeight;
  }
  var focused = null;
  function renderCards() {
    while (cards.firstChild) cards.removeChild(cards.firstChild);
    members.forEach(function (m) {
      var a = actorState[m.label];
      var c = h('button', 'sv-card' + (focused === m.label ? ' is-open' : ''), cards);
      c.type = 'button';
      c.setAttribute('aria-expanded', focused === m.label ? 'true' : 'false');
      c.style.borderColor = m.c1;
      var head = h('div', 'sv-card-head', c);
      var chip = h('span', 'sv-chip', head, String(m.n)); chip.style.background = m.c1;
      h('span', 'sv-card-name', head, m.label);
      h('span', 'sv-card-mood', head, a.mood);
      var en = h('div', 'sv-energy', c); en.setAttribute('aria-label', 'Energy ' + a.energy + ' of 5');
      for (var i = 0; i < 5; i++) h('span', i < a.energy ? 'on' : '', en);
      if (focused === m.label) {
        h('p', 'sv-detail', c, (m.historical ? 'Plays the method of ' + m.label + '. ' : '') + 'Method: ' + m.method);
        h('p', 'sv-detail', c, 'Pushes for: ' + m.stance);
        if (m.temperament) h('p', 'sv-detail', c, 'Argues: ' + m.temperament);
        var tr = S.trust[m.label] || {};
        Object.keys(tr).forEach(function (k) { h('p', 'sv-detail', c, 'Trust in ' + k + ': ' + (tr[k] > 0 ? '+' : '') + tr[k]); });
        var iv = S.interviews[m.label];
        if (iv) h('p', 'sv-detail', c, 'After the day: ' + iv.day);
      }
      c.addEventListener('click', function () { focusMember(m.label); });
    });
  }
  function focusMember(label) { focused = focused === label ? null : label; renderCards(); }

  // ---- Bubbles ---------------------------------------------------------------------------
  var bubble = null;
  function clearBubbles() { while (overlay.firstChild) overlay.removeChild(overlay.firstChild); bubble = null; }
  function wrap(text, n) {
    var words = String(text).split(/\s+/), lines = [], cur = '';
    words.forEach(function (w) { if ((cur + ' ' + w).trim().length > n) { lines.push(cur.trim()); cur = w; } else cur += ' ' + w; });
    if (cur.trim()) lines.push(cur.trim());
    return lines.slice(0, 5);
  }
  function showBubble(label, text, think) {
    clearBubbles();
    var a = actorState[label];
    if (!a) return;
    var lines = wrap(text, 34);
    var bw = 300, bh = 22 + lines.length * 20;
    var x = Math.max(10, Math.min(W - bw - 10, a.x - bw / 2));
    var y = Math.max(10, a.y - 150 * a.m.scale * SIZE - bh);
    var g = el('g', { class: 'sv-bubble' + (think ? ' is-think' : '') }, overlay);
    el('rect', { x: x, y: y, width: bw, height: bh, rx: 12, fill: '#fbfbfa', stroke: think ? a.m.c3 : a.m.c1, 'stroke-width': think ? 1.5 : 2.5, 'stroke-dasharray': think ? '5 4' : null }, g);
    if (!think) el('path', { d: 'M' + (a.x - 8) + ' ' + (y + bh) + ' L' + a.x + ' ' + (y + bh + 14) + ' L' + (a.x + 8) + ' ' + (y + bh), fill: '#fbfbfa', stroke: a.m.c1, 'stroke-width': 2.5 }, g);
    else { el('circle', { cx: a.x, cy: y + bh + 10, r: 5, fill: '#fbfbfa', stroke: a.m.c3, 'stroke-width': 1.5 }, g); el('circle', { cx: a.x + 4, cy: y + bh + 22, r: 3, fill: '#fbfbfa', stroke: a.m.c3, 'stroke-width': 1.5 }, g); }
    lines.forEach(function (l, i) { var t = el('text', { x: x + 14, y: y + 26 + i * 20, class: think ? 'sv-btext is-think' : 'sv-btext' }, g); t.textContent = l; });
    bubble = g;
  }
  function showCard(text, sub) {
    clearBubbles();
    var g = el('g', { class: 'sv-cardover' }, overlay);
    el('rect', { x: 250, y: 250, width: 500, height: 96, rx: 14, fill: C.ink, opacity: 0.92 }, g);
    var t = el('text', { x: 500, y: 290, 'text-anchor': 'middle', class: 'sv-ctitle' }, g); t.textContent = text;
    var s = el('text', { x: 500, y: 320, 'text-anchor': 'middle', class: 'sv-csub' }, g); s.textContent = sub || '';
  }

  // ---- Board and monitor -----------------------------------------------------------------
  function renderBoard() {
    while (boardG.firstChild) boardG.removeChild(boardG.firstChild);
    S.board.slice(0, 6).forEach(function (b, i) {
      var x = 372 + (i % 3) * 88, y = 66 + Math.floor(i / 3) * 42;
      var m = byLabel[b.by];
      var won = S.result && S.result.id === b.id;
      el('rect', { x: x, y: y, width: 80, height: 34, rx: 4, fill: won ? C.accent : '#ffffff', 'fill-opacity': won ? 0.3 : 1, stroke: m ? m.c1 : C.ink, 'stroke-width': won ? 3 : 1.5 }, boardG);
      var t = el('text', { x: x + 6, y: y + 14, class: 'sv-card-t' }, boardG); t.textContent = (b.id + ' ' + (b.concept || '')).slice(0, 15);
      for (var k = 0; k < Math.min(4, b.support); k++) el('circle', { cx: x + 10 + k * 9, cy: y + 26, r: 3, fill: C.ink, 'fill-opacity': 0.7 }, boardG);
      for (var j = 0; j < Math.min(4, b.blocked); j++) el('path', { d: 'M' + (x + 52 + j * 7) + ' ' + (y + 22) + ' l6 6 m0 -6 l-6 6', stroke: '#c8102e', 'stroke-width': 1.6 }, boardG);
    });
    progressBar.setAttribute('width', String(Math.min(90, S.progress * 22)));
    keyboardG.setAttribute('fill', S.keyboard && byLabel[S.keyboard] ? byLabel[S.keyboard].c1 : '#fbfbfa');
    roundLabel.textContent = 'Round ' + (S.round || 0) + ' · ' + (S.phase || '');
  }

  // ---- Playback --------------------------------------------------------------------------
  var idx = -1, playing = false, timer = 0, started = 0;
  function speed() { return Number(speedSel.value) || 1; }
  function visible(i) {
    var s = steps[i];
    if (!s) return false;
    if (s.kind === 'think' && !thoughtsBox.checked) return false;
    if (s.kind === 'quiet') return false;
    if (highlightsBox.checked && !isHighlight(s)) return false;
    return true;
  }
  function duration(s) {
    var e = s.e, base;
    if (s.kind === 'card') base = 1500;
    else if (s.kind === 'moves') base = 1100;
    else if (s.kind === 'say' || s.kind === 'think' || s.kind === 'interview') base = 1100 + 60 * String(e.text || e.day || '').split(/\s+/).length;
    else base = 1800;
    return base / speed();
  }
  function present(s) {
    var e = s.e;
    if (s.kind === 'card') showCard('Round ' + e.r, (e.text || '').split('.')[0]);
    else if (s.kind === 'say') { showBubble(e.who, e.text, false); var a = actorState[e.who]; if (a) a.talk = duration(s); if (e.to && actorState[e.to] && a) a.facing = actorState[e.to].x >= a.x ? 1 : -1; }
    else if (s.kind === 'think') { showBubble(e.who, e.text, true); if (actorState[e.who]) actorState[e.who].talk = 0.01; }
    else if (s.kind === 'event') { showCard('News', e.text.slice(0, 60)); doorFlash.setAttribute('opacity', '0.35'); setTimeout(function () { doorFlash.setAttribute('opacity', '0'); }, 900); }
    else if (s.kind === 'result') showCard('The vote', (e.concept + ' by ' + e.by).slice(0, 60));
    else if (s.kind === 'interview') showBubble(e.who, e.day, false);
    else if (s.kind === 'build') showCard('Build', e.text);
    else if (s.kind === 'moves') clearBubbles();
  }
  function goTo(target, animateLast) {
    target = Math.max(-1, Math.min(steps.length - 1, target));
    if (target < idx) { resetState(); idx = -1; }
    while (idx < target) { idx++; applyStep(steps[idx], idx < target || !animateLast); }
    scrub.value = String(Math.max(0, idx));
    renderBoard(); renderCards();
    if (idx >= 0 && animateLast) present(steps[idx]); else if (idx >= 0 && visible(idx)) present(steps[idx]);
    if (idx >= steps.length - 1 && !data.live) showEnd();
  }
  function nextVisible(from) { var i = from + 1; while (i < steps.length && !visible(i)) i++; return i; }
  function prevVisible(from) { var i = from - 1; while (i > 0 && !visible(i)) i--; return i; }
  function tick() {
    clearTimeout(timer);
    if (!playing) return;
    var n = nextVisible(idx);
    if (n >= steps.length) { if (data.live) { timer = setTimeout(tick, 800); return; } setPlaying(false); return; }
    goTo(n, true);
    timer = setTimeout(tick, duration(steps[n]));
  }
  function setPlaying(on) {
    playing = on;
    playBtn.textContent = on ? 'Pause' : (idx >= steps.length - 1 ? 'Replay' : 'Play');
    playBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    if (on) { if (idx >= steps.length - 1 && !data.live) { resetState(); idx = -1; hideEnd(); } tick(); } else clearTimeout(timer);
  }
  playBtn.addEventListener('click', function () { setPlaying(!playing); });
  nextBtn.addEventListener('click', function () { setPlaying(false); goTo(nextVisible(idx), true); });
  prevBtn.addEventListener('click', function () { setPlaying(false); goTo(prevVisible(idx), true); });
  scrub.addEventListener('input', function () { setPlaying(false); hideEnd(); goTo(Number(scrub.value), false); });
  thoughtsBox.addEventListener('change', function () { var at = idx; resetState(); idx = -1; goTo(at, false); });
  document.addEventListener('keydown', function (e) {
    if (e.target && /INPUT|SELECT|BUTTON/.test(e.target.tagName) && e.key !== ' ') return;
    if (e.key === ' ' && e.target === document.body) { e.preventDefault(); setPlaying(!playing); }
    if (e.key === 'ArrowRight' && e.target === document.body) { setPlaying(false); goTo(nextVisible(idx), true); }
    if (e.key === 'ArrowLeft' && e.target === document.body) { setPlaying(false); goTo(prevVisible(idx), true); }
  });

  // ---- End card --------------------------------------------------------------------------
  var end = h('section', 'sv-end', root);
  end.hidden = true;
  end.setAttribute('aria-label', 'End of the day');
  function showEnd() {
    if (!end.hidden) return;
    while (end.firstChild) end.removeChild(end.firstChild);
    h('h2', 'sv-h2', end, 'End of the day');
    if (S.result) h('p', '', end, 'The team chose ' + S.result.concept + ', pitched by ' + S.result.by + '.');
    var list = h('ul', 'sv-iv', end);
    members.forEach(function (m) { var iv = S.interviews[m.label]; if (iv) h('li', '', list, m.label + ': ' + iv.day + ' ' + iv.lost); });
    var row = h('div', 'sv-end-row', end);
    if (data.artifact) {
      var open = h('button', 'sv-btn', row, 'Open what they made'); open.type = 'button';
      open.addEventListener('click', function () {
        var f = document.createElement('iframe');
        f.setAttribute('sandbox', 'allow-scripts');
        f.setAttribute('title', 'What the team made');
        f.className = 'sv-frame';
        f.srcdoc = data.artifact;
        end.appendChild(f);
        open.disabled = true;
      });
    }
    var back = h('a', 'sv-btn', row, 'Back to the day'); back.href = './';
    var again = h('button', 'sv-btn', row, 'Watch again'); again.type = 'button';
    again.addEventListener('click', function () { hideEnd(); resetState(); idx = -1; setPlaying(true); });
    end.hidden = false;
  }
  function hideEnd() { end.hidden = true; }

  // ---- Frame loop: walking, talking, mood ------------------------------------------------
  var raf = 0, last = 0;
  var HAPPY = /happy|pleased|proud|glad|excited|bright|calm|content|warm|relieved|hopeful|eager|delighted|satisfied/;
  var UPSET = /upset|angry|tired|frustrat|annoy|sad|tense|worried|wary|anxious|bitter|irritat|defeat|stubborn|cold|quiet/;
  function frame(now) {
    var dt = last ? Math.min(now - last, 50) : 16; last = now;
    var still = reduce();
    members.forEach(function (m) {
      var a = actorState[m.label], p = a.parts;
      var dx = a.tx - a.x, dy = a.ty - a.y, dist = Math.sqrt(dx * dx + dy * dy);
      var walking = dist > 1.5 && !still;
      if (still) { a.x = a.tx; a.y = a.ty; }
      else if (walking) { var step = Math.min(dist, 0.32 * dt); a.x += dx / dist * step; a.y += dy / dist * step; if (Math.abs(dx) > 2) a.facing = dx > 0 ? 1 : -1; }
      a.phase += dt * (walking ? 0.016 : 0.003);
      var swing = walking ? Math.sin(a.phase) * 22 : 0;
      p.legs.forEach(function (l, i) { l.setAttribute('transform', 'rotate(' + ((i % 2 ? -1 : 1) * swing) + ' ' + l.getAttribute('x1') + ' ' + l.getAttribute('y1') + ')'); });
      if (p.wheel) p.wheel.setAttribute('transform', 'translate(0 -16) rotate(' + (a.x * 3 % 360) + ')');
      var happy = a.celebrate > 0 || HAPPY.test(a.mood);
      var upset = a.energy === 0 || UPSET.test(a.mood);
      var bob = still ? 0 : (walking ? Math.abs(Math.sin(a.phase)) * -4 : Math.sin(a.phase) * 1.5) + (m.body === 'floating' ? Math.sin(now / 500) * 4 : 0);
      var talking = a.talk > 0 && !still;
      if (a.talk > 0) a.talk -= dt;
      if (a.celebrate > 0) a.celebrate = Math.max(0, a.celebrate - dt / 2500);
      var armUp = a.celebrate > 0 ? -150 : happy ? -20 : upset ? 12 : 0;
      var armSwing = walking ? Math.sin(a.phase) * 18 : talking ? Math.sin(now / 120) * 14 : 0;
      if (p.armL) p.armL.setAttribute('transform', p.armL.getAttribute('transform').replace(/ rotate\([^)]*\)/, '') + ' rotate(' + (armUp + armSwing) + ')');
      if (p.armR) p.armR.setAttribute('transform', p.armR.getAttribute('transform').replace(/ rotate\([^)]*\)/, '') + ' rotate(' + (-armUp - armSwing) + ')');
      var slumpY = upset ? 5 : 0;
      p.body.setAttribute('transform', 'translate(0 ' + (bob + slumpY) + ')');
      if (p.head) {
        var nod = talking ? Math.sin(now / 90) * 2 : 0;
        p.head.setAttribute('transform', 'translate(' + (p.headX || 0) + ' ' + ((p.headY || -86) + nod + (upset ? 3 : 0)) + ') rotate(' + (upset ? 10 : happy ? -6 : 0) + ')');
      }
      if (p.mouth) p.mouth.setAttribute('transform', talking && Math.sin(now / 70) > 0 ? 'scale(1 2)' : '');
      p.flip.setAttribute('transform', 'scale(' + a.facing + ' 1)');
      p.g.setAttribute('transform', 'translate(' + a.x.toFixed(1) + ' ' + a.y.toFixed(1) + ') scale(' + (m.scale * SIZE) + ')');
      p.name.style.opacity = a.talk > 0 || focused === m.label ? '1' : '0';
      p.g.style.opacity = a.present ? '1' : '0';
    });
    // Draw the nearest actors last so feet overlap naturally.
    var order = members.slice().sort(function (x, y) { return actorState[x.label].y - actorState[y.label].y; });
    order.forEach(function (m) { actors.appendChild(actorState[m.label].parts.g); });
    raf = document.hidden ? 0 : requestAnimationFrame(frame);
  }
  document.addEventListener('visibilitychange', function () { if (document.hidden) { cancelAnimationFrame(raf); raf = 0; setPlaying(false); } else if (!raf) { last = 0; raf = requestAnimationFrame(frame); } });

  // ---- Live mode and premiere ------------------------------------------------------------
  if (data.live && window.EventSource) {
    var es = new EventSource(data.live);
    es.onmessage = function (msg) {
      try {
        var e = JSON.parse(msg.data);
        if (e.type === 'header') return;
        events.push(e);
        var atEnd = idx >= steps.length - 1;
        buildSteps();
        if (atEnd && !playing) setPlaying(true);
      } catch (err) { /* skip a bad line */ }
    };
  }

  resetState();
  buildSteps();
  renderBoard();
  renderCards();
  raf = requestAnimationFrame(frame);
  var premiere = new URLSearchParams(location.search).get('premiere');
  var at = premiere ? Date.parse(premiere) : NaN;
  if (!isNaN(at) && at > Date.now()) {
    showCard('Premiere', 'Starts at ' + new Date(at).toLocaleTimeString());
    playBtn.disabled = true;
    setTimeout(function () { playBtn.disabled = false; setPlaying(true); }, Math.min(at - Date.now(), 2147483000));
  } else {
    showCard(data.title || 'The studio', 'Press Play to watch the day');
  }
  void started;
})();
