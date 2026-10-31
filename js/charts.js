// グラフ描画（ライブラリ不使用の SVG / DOM）
import { esc, h } from './ui.js';
import { parseYmd, addDays, ymd } from './store.js';

const md = (d) => { const x = parseYmd(d); return `${x.getMonth() + 1}/${x.getDate()}`; };

// こり・痛みの推移（折れ線）＋ セルフケア回数（棒）
export function painChart(dates, neck, back, care) {
  const W = 340, L = 26, R = 10, T = 10, plotH = 110, gap = 16, barH = 34;
  const H = T + plotH + gap + barH + 22;
  const n = dates.length;
  const x = (i) => L + (n === 1 ? (W - L - R) / 2 : (i / (n - 1)) * (W - L - R));
  const y = (v) => T + plotH - (v / 10) * plotH;
  const baseY = T + plotH + gap + barH;
  const maxCare = Math.max(3, ...care);

  let s = `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="こり・痛みの推移とセルフケア回数のグラフ">`;
  for (const g of [0, 5, 10]) {
    s += `<line class="gl" x1="${L}" x2="${W - R}" y1="${y(g)}" y2="${y(g)}"/><text class="axis" x="${L - 5}" y="${y(g) + 3}" text-anchor="end">${g}</text>`;
  }
  const barW = Math.max(2, Math.min(14, ((W - L - R) / n) * 0.6));
  care.forEach((c, i) => {
    if (!c) return;
    const bh = (c / maxCare) * barH;
    s += `<rect class="bar" x="${x(i) - barW / 2}" y="${baseY - bh}" width="${barW}" height="${bh}" rx="2"><title>${md(dates[i])}：${c}回</title></rect>`;
  });
  s += `<line class="gl" x1="${L}" x2="${W - R}" y1="${baseY}" y2="${baseY}"/><text class="axis" x="${L - 5}" y="${baseY - 2}" text-anchor="end">回</text>`;

  const draw = (vals, cls, shape) => {
    const pts = vals.map((v, i) => (v == null ? null : [x(i), y(v), v, i])).filter(Boolean);
    if (!pts.length) return '';
    let o = pts.length > 1 ? `<polyline class="line ${cls}" points="${pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')}"/>` : '';
    for (const p of pts) {
      const tip = `<title>${md(dates[p[3]])}：${p[2].toFixed(1)}</title>`;
      o += shape === 'circle'
        ? `<circle class="pt ${cls}" cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3.6">${tip}</circle>`
        : `<rect class="pt ${cls}" x="${(p[0] - 3.4).toFixed(1)}" y="${(p[1] - 3.4).toFixed(1)}" width="6.8" height="6.8">${tip}</rect>`;
    }
    return o;
  };
  s += draw(back, 'back', 'square') + draw(neck, 'neck', 'circle');

  const labelIdx = n <= 7 ? dates.map((_, i) => i) : [0, Math.floor((n - 1) / 2), n - 1];
  for (const i of labelIdx) {
    const anchor = n > 7 && i === n - 1 ? 'end' : n > 7 && i === 0 ? 'start' : 'middle';
    s += `<text class="axis" x="${x(i)}" y="${H - 4}" text-anchor="${anchor}">${esc(md(dates[i]))}</text>`;
  }
  return s + '</svg>';
}

// 直近12週のカレンダー（セルフケアをした日を濃く）
export function heatmap(counts, weeks = 12) {
  const today = new Date();
  const dow = (today.getDay() + 6) % 7; // 月曜始まり
  const start = addDays(today, -(weeks - 1) * 7 - dow);
  const cells = [];
  for (let i = 0; i < weeks * 7; i++) {
    const d = addDays(start, i);
    const key = ymd(d);
    const c = counts[key] || 0;
    const future = d > today;
    const lv = future ? 'f' : c === 0 ? 0 : c < 2 ? 1 : c < 4 ? 2 : c < 6 ? 3 : 4;
    cells.push(h('i', { class: `hm l${lv}`, title: future ? '' : `${md(key)}：${c}回` }));
  }
  return h('div', { class: 'heat', role: 'img', 'aria-label': '直近12週のセルフケア実施カレンダー' }, cells);
}
