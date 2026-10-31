// DOM ヘルパーと共通UI（トースト・シート・バナー・こり痛みチェックイン）
import { get, addCheckin } from './store.js';

export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(kid));
  }
  return el;
}

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function toast(msg) {
  const t = h('div', { class: 'toast', role: 'status' }, msg);
  document.body.append(t);
  setTimeout(() => t.classList.add('out'), 2200);
  setTimeout(() => t.remove(), 2700);
}

const openSheets = new Set();
export const closeAllSheets = () => [...openSheets].forEach((close) => close());

export function openSheet(content, { title = '' } = {}) {
  const prevFocus = document.activeElement;
  const onKey = (e) => {
    if (e.key === 'Escape') { close(); return; }
    if (e.key !== 'Tab') return;
    // フォーカスをシートの中に閉じ込める
    const items = [...sheet.querySelectorAll('button, input, a[href], textarea, select')].filter((el) => !el.disabled && !el.hidden);
    if (!items.length) return;
    const first = items[0]; const last = items.at(-1);
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  const overlay = h('div', { class: 'overlay', onclick: (e) => { if (e.target === overlay) close(); } });
  const sheet = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: 'sheet-head' },
      h('h2', {}, title),
      h('button', { class: 'icon-btn', 'aria-label': '閉じる', onclick: () => close() }, '×')),
    content);
  overlay.append(sheet);
  document.body.append(overlay);
  document.addEventListener('keydown', onKey);
  function close() {
    document.removeEventListener('keydown', onKey);
    openSheets.delete(close);
    overlay.remove();
    if (prevFocus && prevFocus.isConnected) prevFocus.focus();
  }
  openSheets.add(close);
  (sheet.querySelector('input, textarea') || sheet.querySelector('button.btn'))?.focus();
  return close;
}

// 画面上部のお知らせバナー
export function showBanner(text, actions = []) {
  const box = document.getElementById('banner');
  box.replaceChildren(h('div', { class: 'banner', role: 'alert' },
    h('span', {}, text),
    h('span', { class: 'banner-actions' },
      actions.map((a) => h('button', { class: 'btn small ' + (a.primary ? 'primary' : 'ghost'), onclick: () => { box.replaceChildren(); a.onClick?.(); } }, a.label)))));
}

const WORDS = ['なし', 'ほぼなし', 'ほぼなし', '軽い', '軽い', '中くらい', '中くらい', 'つらい', 'つらい', 'とてもつらい', 'とてもつらい'];
export const painWord = (v) => WORDS[Math.round(v)] ?? '';

// こり・痛みの記録シート
export function openCheckin({ after = false, onSave } = {}) {
  const last = get().checkins.at(-1);
  const vals = { neck: last ? last.neck : 5, back: last ? last.back : 5 };
  const note = h('input', { type: 'text', class: 'text', maxlength: '80', placeholder: '例：長時間座っていた、朝からだるい など', 'aria-label': 'ひとこと' });

  const row = (key, label) => {
    const out = h('output', { class: 'big-num' }, String(vals[key]));
    const word = h('span', { class: 'pain-word' }, painWord(vals[key]));
    const input = h('input', {
      type: 'range', min: '0', max: '10', step: '1', value: String(vals[key]), 'aria-label': `${label}のつらさ`,
      oninput: (e) => { vals[key] = +e.target.value; out.textContent = vals[key]; word.textContent = painWord(vals[key]); },
    });
    return h('div', { class: 'slider-row' },
      h('div', { class: 'slider-head' }, h('span', { class: `dot ${key}` }), h('strong', {}, label), out, word),
      input,
      h('div', { class: 'range-labels' }, h('span', {}, '0 なし'), h('span', {}, '10 最もつらい')));
  };

  const body = h('div', { class: 'sheet-body' },
    h('p', { class: 'muted' }, after ? 'ケアのあと、今の体の感じを記録しましょう。' : '今の「こり・痛み」の強さを教えてください。'),
    row('neck', '首・肩のこり／痛み'),
    row('back', '腰のこり／痛み'),
    note,
    h('button', {
      class: 'btn primary block',
      onclick: () => { addCheckin({ neck: vals.neck, back: vals.back, note: note.value.trim(), after }); close(); toast('記録しました'); onSave?.(); },
    }, '記録する'));
  const close = openSheet(body, { title: after ? 'ケア後の状態' : '今の状態を記録' });
}
