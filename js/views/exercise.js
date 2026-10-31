import { h, toast, openSheet, openCheckin } from '../ui.js';
import { exById, ROUTINES, AREAS, doseText } from '../data.js';
import { createFigure } from '../figure.js';
import { get, update, addLog, logsOn, ymd, addMedia, listMedia, deleteMedia } from '../store.js';

// ---- 効果音・振動 ----
let actx;
function beep() {
  try {
    actx ||= new AudioContext();
    const o = actx.createOscillator(); const g = actx.createGain();
    o.connect(g); g.connect(actx.destination);
    o.frequency.value = 880; g.gain.value = 0.08;
    o.start(); o.stop(actx.currentTime + 0.18);
  } catch { /* 音が出せなくても続行 */ }
  navigator.vibrate?.([180, 80, 180]);
}

// ---- 体操の詳細（routine: { id, idx } のときは「まとめてケア」の途中） ----
export function exerciseView(id, routine) {
  const ex = exById(id);
  if (!ex) return h('div', { class: 'view' }, h('p', {}, '体操が見つかりません。'), h('a', { class: 'btn', href: '#/library' }, '一覧へ'));
  const r = routine && ROUTINES.find((x) => x.id === routine.id);

  const fig = createFigure(ex);
  const reduce = fig.reduce;
  const btns = {};
  const setMode = (m) => {
    if (m === 'play') fig.play(); else fig.show(m === 'a' ? 0 : 1);
    for (const [k, b] of Object.entries(btns)) b.setAttribute('aria-pressed', String(k === m));
  };
  const panel = (key, label, still) => (btns[key] = h('button', { class: 'panel', 'aria-pressed': 'false', 'aria-label': label, onclick: () => setMode(key) },
    createFigure(ex, { still }).el, h('span', {}, label)));
  btns.play = h('button', { class: 'btn ghost block', 'aria-pressed': 'false', onclick: () => setMode('play') }, '▶ 動きを見る');
  const figControls = h('div', { class: 'fig-controls' },
    h('div', { class: 'fig-strip', role: 'group', 'aria-label': '①はじめの形と②動かした形' }, panel('a', '① はじめ', 0), panel('b', '② 動かした形', 1)),
    btns.play);
  setMode(reduce ? 'a' : 'play');

  const head = h('div', { class: 'ex-head' },
    r && h('p', { class: 'progress-text' }, `${r.name}　${routine.idx + 1} / ${r.ids.length}`),
    r && h('div', { class: 'bar-track' }, h('div', { class: 'bar-fill', style: `width:${(routine.idx / r.ids.length) * 100}%` })),
    h('h1', {}, ex.name),
    h('div', { class: 'meta' }, h('span', { class: 'tag' }, AREAS[ex.area]), h('span', { class: 'tag alt' }, ex.place), h('span', { class: 'muted' }, ex.target)));

  const doseCard = h('section', { class: 'card' },
    h('h2', {}, '回数の目安'), h('p', { class: 'dose' }, doseText(ex)), counter(ex));

  const steps = h('section', { class: 'card' },
    h('h2', {}, 'やり方'), h('ol', { class: 'steps' }, ex.steps.map((s) => h('li', {}, s))));
  const tips = h('section', { class: 'card' },
    h('h2', {}, 'ポイント'), h('ul', { class: 'plain' }, ex.tips.map((s) => h('li', {}, s))),
    h('p', { class: 'why' }, ex.why));
  const caution = h('section', { class: 'card warn' },
    h('h2', {}, '注意'), h('ul', { class: 'plain' }, [...ex.caution, '痛みが強くなる場合は、すぐにやめてください。'].map((s) => h('li', {}, s))));

  // 記録ボタン
  const doneBtn = h('button', { class: 'btn primary block big' });
  const refreshDone = () => {
    const n = logsOn(ymd(new Date())).filter((l) => l.ex === ex.id).length;
    doneBtn.textContent = r ? (routine.idx + 1 < r.ids.length ? 'できた！ 次へ' : 'できた！ 最後です') : (n ? `もう1回できた！（今日${n}回目を記録済み）` : 'やった！ 記録する');
  };
  refreshDone();
  doneBtn.addEventListener('click', () => {
    addLog(ex.id);
    if (r) {
      location.hash = routine.idx + 1 < r.ids.length ? `#/routine/${r.id}/${routine.idx + 1}` : `#/routine/${r.id}/done`;
    } else {
      const total = logsOn(ymd(new Date())).length;
      toast(`記録しました。今日 ${total} 回目のケアです`);
      refreshDone();
    }
  });

  const nav = h('div', { class: 'bottom-actions' },
    doneBtn,
    r && h('a', { class: 'btn ghost block', href: routine.idx + 1 < r.ids.length ? `#/routine/${r.id}/${routine.idx + 1}` : `#/routine/${r.id}/done` }, 'とばす'),
    r
      ? h('a', { class: 'link-btn', href: '#/home' }, 'やめてホームへ')
      : h('a', { class: 'link-btn', href: '#/library' }, '← 体操一覧へ'));

  return h('div', { class: 'view' }, head, h('div', { class: 'card fig-card' }, fig.el, figControls), doseCard, steps, tips, caution, mediaSection(ex), nav);
}

// ---- 回数カウンター / キープタイマー ----
function counter(ex) {
  const d = ex.dose;
  const box = h('div', { class: 'counter' });

  if (d.type === 'hold') {
    const total = d.sets * d.sides;
    let done = 0; let left = d.sec; let timer = 0;
    const big = h('div', { class: 'big-time', 'aria-live': 'off' }, String(d.sec));
    const label = h('div', { class: 'muted' });
    const dots = h('div', { class: 'dots', 'aria-hidden': 'true' });
    const go = h('button', { class: 'btn primary block' }, 'スタート');
    const sideName = () => (d.sides === 2 ? (done % 2 === 0 ? '（片側）' : '（反対側）') : '');
    const paint = () => {
      dots.replaceChildren(...Array.from({ length: total }, (_, i) => h('i', { class: i < done ? 'on' : '' })));
      label.textContent = done >= total ? 'おつかれさまでした！' : `${done + 1} / ${total} 回目 ${sideName()}`;
      go.textContent = timer ? '一時停止' : done >= total ? 'もう一度' : 'スタート';
    };
    const stop = () => { clearInterval(timer); timer = 0; };
    go.addEventListener('click', () => {
      if (timer) { stop(); paint(); return; }
      if (done >= total) { done = 0; }
      left = d.sec; big.textContent = left;
      let t0 = performance.now();
      timer = setInterval(() => {
        if (!box.isConnected) { stop(); return; }
        const el = Math.floor((performance.now() - t0) / 1000);
        left = Math.max(0, d.sec - el);
        big.textContent = left;
        if (left <= 0) { stop(); done++; beep(); big.textContent = d.sec; paint(); }
      }, 200);
      paint();
    });
    box.append(label, big, dots, go);
    paint();
  } else {
    const total = d.reps * d.sets;
    let n = 0;
    const big = h('div', { class: 'big-time' });
    const hint = h('div', { class: 'muted' }, d.hold ? `ゆっくり、1回ごとに${d.hold}秒キープ` : 'ゆっくり、呼吸を止めずに');
    const tap = h('button', { class: 'btn primary block' }, '1回できた +1');
    const undo = h('button', { class: 'link-btn' }, '1つ戻す');
    const paint = () => { big.textContent = `${n} / ${total}`; tap.textContent = n >= total ? 'もう一度' : '1回できた +1'; };
    tap.addEventListener('click', () => { n = n >= total ? 1 : n + 1; navigator.vibrate?.(15); if (n === total) beep(); paint(); });
    undo.addEventListener('click', () => { n = Math.max(0, n - 1); paint(); });
    box.append(hint, big, tap, undo);
    paint();
  }
  return box;
}

// ---- 写真・動画 ----
const ytId = (u) => {
  const m = String(u).match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/))([\w-]{11})/);
  return m ? m[1] : null;
};

function mediaSection(ex) {
  const list = h('div', { class: 'media-list' });
  const empty = h('p', { class: 'muted' }, 'まだ写真・動画がありません。実際の動きを撮影して追加すると、ここで見返せます。');
  const refreshEmpty = () => { empty.hidden = list.children.length > 0; };

  const addItem = (node) => { list.append(node); refreshEmpty(); };
  const withRemove = (node, onRemove) => {
    const wrap = h('div', { class: 'media-item' }, node,
      h('button', { class: 'link-btn danger', onclick: async () => { if (confirm('この写真・動画を削除しますか？')) { await onRemove(); wrap.remove(); refreshEmpty(); } } }, '削除'));
    return wrap;
  };

  // アプリに同梱されたメディア
  for (const m of ex.media) {
    addItem(h('figure', {},
      m.type === 'video' ? h('video', { src: m.src, controls: true, playsinline: true, preload: 'metadata' }) : h('img', { src: m.src, alt: m.caption || ex.name, loading: 'lazy' }),
      m.caption && h('figcaption', {}, m.caption)));
  }
  // 動画リンク
  const linkNode = (url) => {
    const id = ytId(url);
    return id
      ? h('iframe', { src: `https://www.youtube-nocookie.com/embed/${id}`, title: `${ex.name}の動画`, allowfullscreen: true, loading: 'lazy', referrerpolicy: 'strict-origin-when-cross-origin', allow: 'encrypted-media; picture-in-picture' })
      : h('a', { href: url, target: '_blank', rel: 'noopener noreferrer' }, url);
  };
  for (const url of get().links[ex.id] || []) {
    addItem(withRemove(linkNode(url), () => update((s) => { s.links[ex.id] = (s.links[ex.id] || []).filter((u) => u !== url); })));
  }
  // この端末に保存した写真・動画
  listMedia(ex.id).then((rows) => {
    for (const r of rows) {
      const url = URL.createObjectURL(r.blob);
      const node = r.type.startsWith('video') ? h('video', { src: url, controls: true, playsinline: true, preload: 'metadata' }) : h('img', { src: url, alt: r.name, loading: 'lazy' });
      addItem(withRemove(node, () => deleteMedia(r.id)));
    }
  }).catch(() => {});

  const file = h('input', {
    type: 'file', accept: 'image/*,video/*', hidden: true,
    onchange: async (e) => {
      const f = e.target.files[0]; e.target.value = '';
      if (!f) return;
      try {
        const rec = await addMedia(ex.id, f);
        const url = URL.createObjectURL(rec.blob);
        const node = rec.type.startsWith('video') ? h('video', { src: url, controls: true, playsinline: true, preload: 'metadata' }) : h('img', { src: url, alt: rec.name });
        addItem(withRemove(node, () => deleteMedia(rec.id)));
        toast('この端末に保存しました');
      } catch { toast('保存できませんでした（容量を確認してください）'); }
    },
  });

  const addLink = () => {
    const input = h('input', { type: 'url', class: 'text', placeholder: 'https://www.youtube.com/watch?v=…', 'aria-label': '動画のURL' });
    const body = h('div', { class: 'sheet-body' },
      h('p', { class: 'muted' }, 'YouTube などの動画URLを貼り付けます（オンライン時のみ再生できます）。'), input,
      h('button', {
        class: 'btn primary block',
        onclick: () => {
          const url = input.value.trim();
          if (!/^https?:\/\//.test(url)) { toast('http(s):// から始まるURLを入力してください'); return; }
          update((s) => { (s.links[ex.id] ||= []).push(url); });
          addItem(withRemove(linkNode(url), () => update((s) => { s.links[ex.id] = s.links[ex.id].filter((u) => u !== url); })));
          close();
        },
      }, '追加する'));
    const close = openSheet(body, { title: '動画リンクを追加' });
  };

  return h('section', { class: 'card' },
    h('h2', {}, '写真・動画'), empty, list,
    h('div', { class: 'row' },
      h('button', { class: 'btn ghost', onclick: () => file.click() }, '写真・動画を追加'),
      h('button', { class: 'btn ghost', onclick: addLink }, '動画リンクを追加')),
    file,
    h('p', { class: 'muted small-text' }, '追加したものはこの端末の中だけに保存され、外部には送信されません。'));
}

// ---- まとめてケア完了画面 ----
export function routineDoneView(routineId) {
  const r = ROUTINES.find((x) => x.id === routineId);
  return h('div', { class: 'view center' },
    h('div', { class: 'celebrate', 'aria-hidden': 'true' }, '✓'),
    h('h1', {}, 'おつかれさまでした！'),
    h('p', {}, r ? `「${r.name}」を終えました。` : ''),
    h('p', { class: 'muted' }, 'ケアのあとの体の感じを記録すると、変化が見えるようになります。'),
    h('button', { class: 'btn primary block big', onclick: () => openCheckin({ after: true, onSave: () => { location.hash = '#/records'; } }) }, '今の状態を記録する'),
    h('a', { class: 'btn ghost block', href: '#/home' }, 'ホームへ戻る'));
}
