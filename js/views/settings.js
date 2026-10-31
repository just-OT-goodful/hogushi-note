import { h, toast } from '../ui.js';
import { get, update, exportJSON, importJSON, resetAll, WEEK } from '../store.js';
import { supported, requestPermission, notify, buildICS, downloadFile } from '../reminder.js';

let deferredInstall = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredInstall = e; });

const PRESETS = [
  { label: '2時間おき（9〜17時）', times: ['09:00', '11:00', '13:00', '15:00', '17:00'] },
  { label: '朝・昼・夕', times: ['08:00', '12:30', '17:30'] },
  { label: '朝・夜', times: ['07:30', '21:30'] },
];

export function settingsView() {
  const root = h('div', { class: 'view' });
  const draw = () => root.replaceChildren(...build(draw));
  draw();
  return root;
}

function build(redraw) {
  const r = get().remind;
  const perm = supported ? Notification.permission : 'unsupported';

  const permText = {
    granted: '通知：許可されています',
    denied: '通知：ブロックされています（端末の設定から許可してください）',
    default: '通知：まだ許可されていません',
    unsupported: 'この端末・ブラウザでは通知を使えません',
  }[perm];

  const toggle = h('label', { class: 'switch' },
    h('input', {
      type: 'checkbox', checked: r.enabled,
      onchange: async (e) => {
        const on = e.target.checked;
        if (on && supported && Notification.permission === 'default') {
          const res = await requestPermission();
          if (res !== 'granted') toast('通知が許可されなかったため、アプリ内のお知らせのみになります');
        }
        update((s) => { s.remind.enabled = on; });
        redraw();
      },
    }),
    h('span', {}, 'リマインドを使う'));

  const timeRow = (t, i) => h('div', { class: 'time-row' },
    h('input', {
      type: 'time', value: t, 'aria-label': `${i + 1}つ目の時刻`,
      onchange: (e) => { if (e.target.value) update((s) => { s.remind.times[i] = e.target.value; }); },
    }),
    h('button', { class: 'link-btn danger', onclick: () => { update((s) => s.remind.times.splice(i, 1)); redraw(); } }, '削除'));

  const days = h('div', { class: 'chips', role: 'group', 'aria-label': '曜日' },
    [1, 2, 3, 4, 5, 6, 0].map((d) => h('button', {
      class: 'chip' + (r.days.includes(d) ? ' on' : ''), 'aria-pressed': String(r.days.includes(d)),
      onclick: () => { update((s) => { s.remind.days = s.remind.days.includes(d) ? s.remind.days.filter((x) => x !== d) : [...s.remind.days, d]; }); redraw(); },
    }, WEEK[d])));

  const remindCard = h('section', { class: 'card' },
    h('h2', {}, 'リマインド'),
    toggle,
    h('p', { class: 'muted small-text' }, permText),
    h('h3', {}, '知らせる時刻'),
    r.times.map(timeRow),
    h('div', { class: 'row' },
      h('button', { class: 'btn ghost', onclick: () => { update((s) => s.remind.times.push('12:00')); redraw(); } }, '＋ 時刻を追加')),
    h('h3', {}, 'おすすめの設定'),
    h('div', { class: 'chips' }, PRESETS.map((p) => h('button', { class: 'chip', onclick: () => { update((s) => { s.remind.times = [...p.times]; }); redraw(); } }, p.label))),
    h('h3', {}, '曜日'), days,
    h('div', { class: 'row' },
      h('button', { class: 'btn ghost', onclick: async () => { const ok = await notify('セルフケアの時間です', '肩と腰を少し動かしましょう'); toast(ok ? '通知を送りました' : '通知を送れませんでした（許可を確認してください）'); } }, 'テスト通知')));

  const calCard = h('section', { class: 'card' },
    h('h2', {}, 'カレンダーに登録（確実に知らせたい方向け）'),
    h('p', { class: 'muted' }, 'Webアプリは、アプリを閉じている間に決まった時刻で通知を出すことができません。上の時刻を、スマホのカレンダー（くり返し予定・アラーム付き）として登録しておくと、確実に知らせてくれます。'),
    h('button', {
      class: 'btn primary block',
      onclick: () => {
        if (!r.times.length || !r.days.length) { toast('時刻と曜日を設定してください'); return; }
        downloadFile('selfcare-reminder.ics', buildICS(new URL('./', location.href).href), 'text/calendar');
        toast('ダウンロードしたファイルを開いてカレンダーに追加してください');
      },
    }, 'カレンダー用ファイル(.ics)を保存'));

  const installCard = h('section', { class: 'card' },
    h('h2', {}, 'ホーム画面に追加'),
    h('p', { class: 'muted' }, 'iPhone：Safariの共有ボタン →「ホーム画面に追加」／Android：Chromeのメニュー →「ホーム画面に追加」または「インストール」'),
    deferredInstall && h('button', { class: 'btn ghost', onclick: async () => { deferredInstall.prompt(); await deferredInstall.userChoice; deferredInstall = null; redraw(); } }, 'インストールする'));

  const importInput = h('input', {
    type: 'file', accept: 'application/json,.json', hidden: true,
    onchange: async (e) => {
      const f = e.target.files[0]; e.target.value = '';
      if (!f) return;
      try { importJSON(await f.text()); toast('読み込みました'); redraw(); } catch { toast('読み込めませんでした（ファイルを確認してください）'); }
    },
  });

  const dataCard = h('section', { class: 'card' },
    h('h2', {}, 'データのバックアップ'),
    h('p', { class: 'muted' }, '記録はこの端末の中だけに保存されます。機種変更や、ブラウザのデータ削除に備えて、ときどき書き出しておくと安心です。（写真・動画は含まれません）'),
    h('div', { class: 'row' },
      h('button', { class: 'btn ghost', onclick: () => downloadFile(`selfcare-backup-${new Date().toISOString().slice(0, 10)}.json`, exportJSON(), 'application/json') }, '書き出す'),
      h('button', { class: 'btn ghost', onclick: () => importInput.click() }, '読み込む')),
    importInput,
    h('button', {
      class: 'link-btn danger',
      onclick: () => { if (confirm('すべての記録とリマインド設定を削除します。元に戻せません。よろしいですか？')) { resetAll(); toast('削除しました'); redraw(); } },
    }, '記録をすべて削除'));

  const about = h('section', { class: 'card' },
    h('h2', {}, 'このアプリについて'),
    h('p', { class: 'muted' }, '肩こり・腰痛のセルフケアを習慣にするためのアプリです。診断や治療の代わりにはなりません。痛みやしびれが強い場合は、医療機関に相談してください。'));

  return [h('h1', { class: 'page-title' }, '設定'), remindCard, calCard, installCard, dataCard, about];
}
