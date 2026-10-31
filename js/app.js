// ルーター・リマインド監視・Service Worker 登録
import { showBanner, closeAllSheets, toast } from './ui.js';
import { setSaveErrorHandler, ymd } from './store.js';
import { homeView } from './views/home.js';
import { libraryView } from './views/library.js';
import { exerciseView, routineDoneView } from './views/exercise.js';
import { recordsView } from './views/records.js';
import { settingsView } from './views/settings.js';
import { ROUTINES } from './data.js';
import { dueReminders, markFired, notify } from './reminder.js';

const app = document.getElementById('app');
const tabs = [...document.querySelectorAll('#tabs a')];

function view() {
  const [, name = 'home', a, b] = location.hash.replace(/^#/, '').split('/');
  switch (name) {
    case 'library': return ['library', libraryView()];
    case 'ex': return ['library', exerciseView(a)];
    case 'records': return ['records', recordsView()];
    case 'settings': return ['settings', settingsView()];
    case 'routine': {
      const r = ROUTINES.find((x) => x.id === a);
      if (!r) return ['home', homeView()];
      if (b === 'done') return ['home', routineDoneView(a)];
      const idx = Math.min(Math.max(parseInt(b, 10) || 0, 0), r.ids.length - 1);
      return ['home', exerciseView(r.ids[idx], { id: r.id, idx })];
    }
    default: return ['home', homeView()];
  }
}

let renderedDay = ymd(new Date());

// 記録を保存できなかったときは、気づけるように知らせる（ストレージの空き不足・プライベートモード等）
let warned = false;
setSaveErrorHandler(() => {
  if (warned) return;
  warned = true;
  toast('記録を保存できませんでした。端末の空き容量やプライベートモードを確認してください');
});

function render() {
  closeAllSheets();
  renderedDay = ymd(new Date());
  const [tab, el] = view();
  app.replaceChildren(el);
  tabs.forEach((t) => (t.dataset.tab === tab ? t.setAttribute('aria-current', 'page') : t.removeAttribute('aria-current')));
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', render);
render();

// ---- リマインド（アプリを開いている間） ----
async function tick() {
  const due = dueReminders();
  if (!due.length) return;
  markFired(due);
  const hour = new Date().getHours();
  const routine = ROUTINES.find((r) => r.id === (hour < 11 ? 'morning' : hour >= 19 ? 'night' : 'desk'));
  showBanner('セルフケアの時間です。肩と腰を少し動かしましょう。', [
    { label: '始める', primary: true, onClick: () => { location.hash = `#/routine/${routine.id}/0`; } },
    { label: 'あとで' },
  ]);
  if (document.hidden) await notify('セルフケアの時間です', '肩と腰を少し動かしましょう');
}
tick();
setInterval(tick, 20000);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  tick();
  // 日付をまたいで開いたままだった場合は、今日の表示に更新する（体操の途中などは触らない）
  const name = location.hash.replace(/^#\/?/, '').split('/')[0];
  if (ymd(new Date()) !== renderedDay && (name === '' || name === 'home' || name === 'records')) render();
});

// ---- Service Worker（オフライン対応・ホーム画面追加） ----
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
