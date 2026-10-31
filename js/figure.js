// 人物イラストのアニメーション（開始姿勢 a ⇄ 動かした姿勢 b）
// 髪・服・肌を塗り分けた人物を、関節の座標から描画します。矢印は動かす向き、赤い丸は効かせたい場所です。
import { BASES, BASE_STYLE, ARROWS } from './data.js';

const NS = 'http://www.w3.org/2000/svg';
const JOINTS = ['head', 'neck', 'sL', 'sR', 'eL', 'eR', 'wL', 'wR', 'mid', 'pelvis', 'hL', 'hR', 'kL', 'kR', 'aL', 'aR'];
const lerp = (a, b, t) => a + (b - a) * t;
const f = (n) => n.toFixed(1);
const pt = (p) => `${f(p[0])},${f(p[1])}`;
const ease = (t) => t * t * (3 - 2 * t);
const mk = (tag, attrs = {}) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
};

// ゆっくり動かし、両端で少し止まる
function profile(ph) {
  if (ph < 0.12) return 0;
  if (ph < 0.46) return (ph - 0.12) / 0.34;
  if (ph < 0.58) return 1;
  if (ph < 0.92) return 1 - (ph - 0.58) / 0.34;
  return 0;
}

const joint = (P, k) => P[k] || (k === 'mid' ? [(P.neck[0] + P.pelvis[0]) / 2, (P.neck[1] + P.pelvis[1]) / 2] : null);
function mix(A, B, t) {
  const o = {};
  for (const k of JOINTS) {
    const a = joint(A, k); const b = joint(B, k);
    if (!a || !b) continue;
    o[k] = [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
  }
  return o;
}

// 奥側(R)→胴体→手前側(L) の順に重ねて描く
const PARTS = [
  { cls: 'shirt far', w: 11, j: ['sR', 'eR'] },
  { cls: 'skin far', w: 8.5, j: ['eR', 'wR'] },
  { dot: 'wR', cls: 'skin far' },
  { cls: 'pants far', w: 15, j: ['hR', 'kR'] },
  { cls: 'pants far', w: 12, j: ['kR', 'aR'] },
  { shoe: 'aR', cls: 'shoe far' },
  { torso: true },
  { cls: 'shirt', w: 15, j: ['sL', 'sR'] },
  { cls: 'pants', w: 16, j: ['hL', 'pelvis', 'hR'] },
  { cls: 'pants', w: 15, j: ['hL', 'kL'] },
  { cls: 'pants', w: 12, j: ['kL', 'aL'] },
  { shoe: 'aL', cls: 'shoe' },
  { cls: 'shirt', w: 11, j: ['sL', 'eL'] },
  { cls: 'skin', w: 8.5, j: ['eL', 'wL'] },
  { dot: 'wL', cls: 'skin' },
  { cls: 'skin', w: 8, j: ['neck', 'head'] },
];

let uid = 0;

export function createFigure(ex, { still = false, period = 4200 } = {}) {
  const base = BASES[ex.base];
  const style = BASE_STYLE[ex.base];
  const A = { ...base.pose, ...ex.a };
  const B = { ...base.pose, ...ex.b };
  const arrows = ARROWS[ex.id] || [];
  const markerId = `arr${++uid}`;

  const wrap = document.createElement('div');
  wrap.className = 'fig';
  wrap.innerHTML = `<svg viewBox="0 0 200 200" role="img" aria-label="${ex.name}の動き">
    <defs><marker id="${markerId}" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="4.2" markerHeight="4.2" orient="auto"><path d="M0,0 L10,5 L0,10 z" class="arrow-head"/></marker></defs>
    <g class="scene">${base.scene}</g><g class="parts"></g><g class="focus"></g><g class="arrows"></g></svg>`;
  const parts = wrap.querySelector('.parts');
  const focusGroup = wrap.querySelector('.focus');
  const arrowGroup = wrap.querySelector('.arrows');

  // 各パーツの要素を作る
  const els = PARTS.map((p) => {
    let e;
    if (p.torso) e = mk('path', { class: 'shirt', 'stroke-width': style.torsoW });
    else if (p.dot) e = mk('circle', { class: `fill-${p.cls}`, r: 4.8 });
    else if (p.shoe) e = mk('line', { class: p.cls, 'stroke-width': 7 });
    else e = mk('polyline', { class: p.cls, 'stroke-width': p.w });
    e.classList.add('limb');
    parts.append(e);
    return e;
  });
  const headG = mk('g', { class: 'headg' });
  headG.innerHTML = '<circle r="12" class="fill-skin"/><path class="fill-hair" d="M-12.2,-1.5 A12.2 12.2 0 0 1 12.2,-1.5 Q0,-7 -12.2,-1.5 Z"/><g class="eyes"></g>';
  const eyes = headG.querySelector('.eyes');
  const eyeXs = style.face === 0 ? [-4.4, 4.4] : [style.face * 5.4];
  for (const x of eyeXs) eyes.append(mk('circle', { cx: x, cy: 2, r: 1.8, class: 'eye' }));
  parts.append(headG);

  const rings = (ex.focus || []).map((fc) => {
    const c = mk('circle', { r: 13, class: 'ring' });
    focusGroup.append(c);
    return { c, fc };
  });
  const arrowEls = arrows.map(([x1, y1, x2, y2, cx, cy]) => {
    const d = cx == null ? `M${x1},${y1} L${x2},${y2}` : `M${x1},${y1} Q${cx},${cy} ${x2},${y2}`;
    const a = mk('path', { d, class: 'arrow', 'marker-end': `url(#${markerId})` });
    arrowGroup.append(a);
    return a;
  });

  function render(t) {
    const p = mix(A, B, t);
    PARTS.forEach((part, i) => {
      const e = els[i];
      if (part.torso) {
        e.setAttribute('d', `M${pt(p.neck)} Q${pt(p.mid)} ${pt(p.pelvis)}`);
      } else if (part.dot) {
        const q = p[part.dot]; e.setAttribute('cx', f(q[0])); e.setAttribute('cy', f(q[1]));
      } else if (part.shoe) {
        const q = p[part.shoe]; const s = style.shoe;
        e.setAttribute('x1', f(q[0] + s[0])); e.setAttribute('y1', f(q[1] + s[1]));
        e.setAttribute('x2', f(q[0] + s[2])); e.setAttribute('y2', f(q[1] + s[3]));
      } else {
        e.setAttribute('points', part.j.map((k) => pt(p[k])).join(' '));
      }
    });
    // 頭は「首→頭」の向きに合わせて傾ける
    const ux = p.head[0] - p.neck[0]; const uy = p.head[1] - p.neck[1];
    const deg = (Math.atan2(ux, -uy) * 180) / Math.PI;
    headG.setAttribute('transform', `translate(${f(p.head[0])},${f(p.head[1])}) rotate(${f(deg)})`);
    for (const { c, fc } of rings) {
      const pos = typeof fc === 'string' ? p[fc] : fc;
      c.setAttribute('cx', f(pos[0])); c.setAttribute('cy', f(pos[1]));
    }
    const op = f(0.35 + 0.65 * t);
    for (const a of arrowEls) a.setAttribute('opacity', op);
  }

  let raf = 0;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  function stop() { cancelAnimationFrame(raf); raf = 0; }
  function play() {
    stop();
    const t0 = performance.now();
    const frame = (now) => {
      if (!wrap.isConnected) { stop(); return; }
      render(ease(profile(((now - t0) % period) / period)));
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
  }
  function show(tt) { stop(); render(tt); }

  render(still === false ? 0 : Number(still));
  return { el: wrap, play, show, stop, get playing() { return !!raf; }, reduce };
}
