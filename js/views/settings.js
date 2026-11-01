import { h, toast, twoCols } from '../ui.js';
import { get, update, importJSON, resetAll, WEEK } from '../store.js';
import { supported, requestPermission, notify, buildICS, downloadFile } from '../reminder.js';
import { backupNow, daysSinceBackup, persistStatus } from '../backup.js';

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
      onchange: (e) => {
        if (!e.target.value) return;
        update((s) => { s.remind.times[i] = e.target.value; s.remind.times = [...new Set(s.remind.times)].sort(); });
        redraw();
      },
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
      h('button', { class: 'btn ghost', onclick: () => { update((s) => { s.remind.times = [...new Set([...s.remind.times, '12:00'])].sort(); }); redraw(); } }, '＋ 時刻を追加')),
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
      try {
        const res = importJSON(await f.text());
        toast(res.skipped ? `読み込みました（${res.skipped}件は形式が不正のため除きました）` : '読み込みました');
        redraw();
      } catch { toast('読み込めませんでした（ファイルを確認してください）'); }
    },
  });

  const lastBackupText = () => {
    const t = get().meta.lastBackup;
    if (!t) return 'まだ保存していません';
    const d = new Date(t);
    const days = daysSinceBackup();
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}（${days === 0 ? '今日' : `${days}日前`}）`;
  };
  const persistNote = h('p', { class: 'muted small-text' });
  persistStatus().then((st) => {
    persistNote.textContent = st === 'yes' ? '端末の保存：ブラウザに「消さないでほしい」と許可されています。'
      : st === 'no' ? '端末の保存：容量が足りなくなると、ブラウザが記録を整理する可能性があります（まれです）。' : '';
  });

  const dataCard = h('section', { class: 'card' },
    h('h2', {}, 'データのバックアップ'),
    h('p', { class: 'muted' }, '記録は、この端末の中だけに保存されています。機種変更・アプリの削除・ブラウザのデータ削除で消えることがあるため、ときどきバックアップを保存しておくと安心です。'),
    h('p', { class: 'last-backup' }, h('strong', {}, '最終バックアップ：'), lastBackupText()),
    h('button', {
      class: 'btn primary block',
      onclick: async () => {
        const res = await backupNow();
        if (res === 'cancelled') return;
        toast(res === 'shared' ? 'バックアップを保存しました。ファイルアプリやLINEなど、保管先を選んでください' : 'バックアップのファイルを保存しました');
        redraw();
      },
    }, 'バックアップを保存・送る'),
    h('p', { class: 'muted small-text' }, '保存したファイルは、「ファイル」アプリやメール、LINEのKeepメモなど、消えない場所に残してください。'),
    h('button', { class: 'btn ghost block', onclick: () => importInput.click() }, 'バックアップから復元する'),
    h('p', { class: 'muted small-text' }, '復元は「追加」方式です。いまの記録は消えず、バックアップにある記録が加わります。'),
    persistNote,
    h('p', { class: 'muted small-text' }, '※ 写真・動画（自分で追加したもの）はバックアップに含まれません。'),
    importInput,
    h('button', {
      class: 'link-btn danger',
      onclick: () => { if (confirm('すべての記録とリマインド設定を削除します。元に戻せません。よろしいですか？')) { resetAll(); toast('削除しました'); redraw(); } },
    }, '記録をすべて削除'));

  const about = h('section', { class: 'card' },
    h('h2', {}, 'このアプリについて'),
    h('p', { class: 'muted' }, '肩こり・腰痛のセルフケアを習慣にするためのアプリです。診断や治療の代わりにはなりません。痛みやしびれが強い場合は、医療機関に相談してください。'));

  return [h('h1', { class: 'page-title' }, '設定'), twoCols([remindCard, calCard], [installCard, dataCard, about])];
}
