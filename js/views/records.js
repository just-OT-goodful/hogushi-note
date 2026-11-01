import { h, openCheckin, toast, painWord } from '../ui.js';
import { get, mean, rangeDates, dailyMean, dayCounts, streak, afterCareEffect, removeLog, removeCheckin, WEEK } from '../store.js';
import { exById } from '../data.js';
import { painChart, heatmap } from '../charts.js';

let range = 7;

const fmtDelta = (d) => (d > 0 ? '+' : d < 0 ? '−' : '±') + Math.abs(d).toFixed(1);

export function recordsView() {
  const root = h('div', { class: 'view cols' });
  const draw = () => root.replaceChildren(...build(draw));
  draw();
  return root;
}

function build(redraw) {
  const s = get();
  const dates = rangeDates(range);
  const prevDates = rangeDates(range, range);
  const counts = dayCounts();
  const neck = dailyMean('neck', dates);
  const back = dailyMean('back', dates);
  const care = dates.map((d) => counts[d] || 0);
  const total = care.reduce((a, b) => a + b, 0);
  const careDays = care.filter(Boolean).length;

  const seg = h('div', { class: 'segs', role: 'group', 'aria-label': '表示する期間' },
    [[7, '7日'], [30, '30日'], [90, '90日']].map(([n, label]) =>
      h('button', { class: 'seg', 'aria-pressed': String(range === n), onclick: () => { range = n; redraw(); } }, label)));

  const summary = (key, label, cls, cur, prev) => {
    const a = mean(cur.filter((v) => v != null));
    const b = mean(prev.filter((v) => v != null));
    let msg = '記録がありません';
    let tone = '';
    if (a != null) {
      msg = `平均 ${a.toFixed(1)}（${painWord(a)}）`;
      if (b != null) {
        const d = a - b;
        tone = d <= -0.5 ? 'good' : d >= 0.5 ? 'bad' : '';
        msg += `　前の${range}日より ${fmtDelta(d)}`;
      }
    }
    return h('div', { class: 'sum ' + tone }, h('span', { class: `dot ${cls}` }), h('strong', {}, label), h('span', {}, msg));
  };

  const prevNeck = dailyMean('neck', prevDates);
  const prevBack = dailyMean('back', prevDates);
  const eff = afterCareEffect();

  const changeCard = h('section', { class: 'card' },
    h('h2', {}, 'こり・痛みの変化'),
    seg,
    s.checkins.length
      ? h('div', { class: 'chart-wrap', html: painChart(dates, neck, back, care) })
      : h('p', { class: 'muted pad' }, 'まだ記録がありません。「こり・痛みを記録する」から始めましょう。'),
    h('div', { class: 'legend' },
      h('span', {}, h('i', { class: 'lg neck' }), '首・肩'),
      h('span', {}, h('i', { class: 'lg back' }), '腰'),
      h('span', {}, h('i', { class: 'lg bar' }), 'ケアの回数')),
    summary('neck', '首・肩', 'neck', neck, prevNeck),
    summary('back', '腰', 'back', back, prevBack),
    eff.n > 0 && h('p', { class: 'muted small-text' }, `ケア直後の変化（${eff.n}回の平均）：首・肩 ${fmtDelta(eff.neck)}、腰 ${fmtDelta(eff.back)}　※マイナスは楽になった状態`),
    h('p', { class: 'muted small-text' }, '数字が小さいほど楽な状態です。1日に複数回記録した日は平均で表示します。'),
    h('button', { class: 'btn primary block', onclick: () => openCheckin({ onSave: redraw }) }, 'こり・痛みを記録する'));

  const careCard = h('section', { class: 'card' },
    h('h2', {}, 'セルフケアの見える化'),
    h('div', { class: 'stats' },
      statBox(total, `${range}日間のケア（回）`),
      statBox(careDays, `ケアした日（日）`),
      statBox(streak(), '連続日数（日）')),
    h('h3', {}, '直近12週のカレンダー'),
    heatmap(counts),
    h('div', { class: 'legend small' }, '少', [0, 1, 2, 3, 4].map((l) => h('i', { class: `hm l${l}` })), '多'),
    topList(dates));

  return [h('h1', { class: 'page-title' }, '記録'), changeCard, careCard, historyCard(redraw)];
}

const statBox = (n, label) => h('div', { class: 'stat' }, h('b', {}, String(n)), h('span', {}, label));

function topList(dates) {
  const set = new Set(dates);
  const by = {};
  for (const l of get().logs) {
    const d = new Date(l.ts);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (set.has(key)) by[l.ex] = (by[l.ex] || 0) + 1;
  }
  const rows = Object.entries(by).sort((a, b) => b[1] - a[1]);
  if (!rows.length) return h('p', { class: 'muted pad' }, 'この期間のケア記録はまだありません。');
  const max = rows[0][1];
  return h('div', {},
    h('h3', {}, 'よく行った体操'),
    rows.slice(0, 6).map(([id, n]) => h('div', { class: 'hbar' },
      h('span', { class: 'hl' }, exById(id)?.name || id),
      h('span', { class: 'hb' }, h('i', { style: `width:${(n / max) * 100}%` })),
      h('span', { class: 'hn' }, `${n}`))));
}

function historyCard(redraw) {
  const s = get();
  const items = [
    ...s.logs.map((l) => ({ t: l.ts, kind: 'log', data: l })),
    ...s.checkins.map((c) => ({ t: c.ts, kind: 'chk', data: c })),
  ].sort((a, b) => b.t - a.t).slice(0, 12);

  const fmt = (ts) => { const d = new Date(ts); return `${d.getMonth() + 1}/${d.getDate()}（${WEEK[d.getDay()]}）${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

  return h('section', { class: 'card' },
    h('h2', {}, '最近の記録'),
    items.length
      ? h('ul', { class: 'history' }, items.map((it) => h('li', {},
        h('span', { class: 'muted' }, fmt(it.t)),
        h('span', { class: 'hi' }, it.kind === 'log'
          ? `ケア：${exById(it.data.ex)?.name || it.data.ex}`
          : `状態：首・肩 ${it.data.neck} / 腰 ${it.data.back}${it.data.after ? '（ケア後）' : ''}${it.data.note ? `　「${it.data.note}」` : ''}`),
        h('button', {
          class: 'link-btn danger', 'aria-label': 'この記録を削除',
          onclick: () => { if (confirm('この記録を削除しますか？')) { (it.kind === 'log' ? removeLog : removeCheckin)(it.data.id); toast('削除しました'); redraw(); } },
        }, '削除'))))
      : h('p', { class: 'muted' }, 'まだ記録がありません。'));
}
