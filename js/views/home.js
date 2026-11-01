import { h, openCheckin, painWord, toast } from '../ui.js';
import { get, update, ymd, WEEK, logsOn, checkinsOn, dayCounts, streak, rangeDates } from '../store.js';
import { backupNow, backupNudge, snoozeBackupNudge } from '../backup.js';
import { ROUTINES, SAFETY, exById, routineMinutes } from '../data.js';
import { nextReminder } from '../reminder.js';

const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

export function homeView() {
  const now = new Date();
  const hour = now.getHours();
  const greet = hour < 11 ? 'おはようございます' : hour < 18 ? 'こんにちは' : 'こんばんは';
  const today = ymd(now);
  const todayLogs = logsOn(today);
  const counts = dayCounts();
  const st = streak();
  const weekDates = rangeDates(7);
  const doneDays = weekDates.filter((d) => counts[d]).length;
  const lastCheck = checkinsOn(today).at(-1);
  const next = nextReminder(now);

  const hero = h('section', { class: 'card hero' },
    h('p', { class: 'muted' }, `${now.getMonth() + 1}月${now.getDate()}日（${WEEK[now.getDay()]}）`),
    h('h1', {}, greet),
    h('div', { class: 'stats' },
      stat(todayLogs.length, '今日のケア（回）'),
      stat(st, '連続日数（日）'),
      stat(`${doneDays}/7`, '今週ケアした日')),
    h('div', { class: 'week', role: 'img', 'aria-label': `直近7日のうち${doneDays}日セルフケアをしました` },
      weekDates.map((d) => {
        const dt = new Date(d.replace(/-/g, '/'));
        return h('div', { class: 'wd' + (d === today ? ' today' : '') },
          h('span', { class: 'wl' }, WEEK[dt.getDay()]),
          h('span', { class: 'wc' + (counts[d] ? ' on' : '') }, counts[d] ? String(counts[d]) : ''));
      })),
    next
      ? h('p', { class: 'muted small-text' }, `次のお知らせ：${sameDay(next, now) ? '今日' : `${next.getMonth() + 1}/${next.getDate()}（${WEEK[next.getDay()]}）`} ${String(next.getHours()).padStart(2, '0')}:${String(next.getMinutes()).padStart(2, '0')}`)
      : h('p', { class: 'muted small-text' }, h('a', { href: '#/settings' }, 'リマインドを設定'), 'すると、ケアの時間をお知らせします。'));

  const rerender = () => window.dispatchEvent(new Event('hashchange'));
  const nudge = backupNudge();
  const notice = !get().meta.introSeen
    ? h('section', { class: 'card notice' },
      h('h2', {}, 'はじめに：記録の保存について'),
      h('ul', { class: 'plain' },
        h('li', {}, '記録は、この端末の中だけに保存されます（外部には送られません）。'),
        h('li', {}, '機種変更・アプリの削除・ブラウザのデータ削除で消えることがあります。'),
        h('li', {}, '設定の「バックアップを保存・送る」で、ときどき保存しておくと安心です。'),
        isStandalone() ? null : h('li', {}, 'ホーム画面に追加してから使うと、記録が消えにくくなります。')),
      h('div', { class: 'row' },
        h('button', { class: 'btn primary', onclick: () => { update((s) => { s.meta.introSeen = true; }); rerender(); } }, 'わかりました'),
        h('a', { class: 'btn ghost', href: '#/settings' }, '設定を開く')))
    : nudge
      ? h('section', { class: 'card notice' },
        h('h2', {}, 'バックアップしましょう'),
        h('p', {}, nudge.never ? '記録はまだバックアップされていません。機種変更や削除に備えて、保存しておきましょう。' : `最後のバックアップから${nudge.days}日たちました。記録が増えているので、保存しておきましょう。`),
        h('div', { class: 'row' },
          h('button', {
            class: 'btn primary',
            onclick: async () => {
              const res = await backupNow();
              if (res === 'cancelled') return;
              toast('バックアップを保存しました');
              rerender();
            },
          }, '今すぐバックアップ'),
          h('button', { class: 'btn ghost', onclick: () => { snoozeBackupNudge(7); rerender(); } }, '7日後に知らせる')))
      : null;

  const check = h('section', { class: 'card' },
    h('h2', {}, '今日の状態'),
    lastCheck
      ? h('div', { class: 'today-check' },
        pill('neck', '首・肩', lastCheck.neck), pill('back', '腰', lastCheck.back))
      : h('p', { class: 'muted' }, 'まだ記録がありません。ケアの前後で記録すると、変化が見えてきます。'),
    h('button', { class: 'btn ' + (lastCheck ? 'ghost' : 'primary') + ' block', onclick: () => openCheckin({ onSave: () => window.dispatchEvent(new Event('hashchange')) }) },
      lastCheck ? 'もう一度記録する' : 'こり・痛みを記録する'));

  const routines = h('section', {},
    h('h2', { class: 'sec' }, 'まとめてケア'),
    ROUTINES.map((r) => h('a', { class: 'card routine', href: `#/routine/${r.id}/0` },
      h('div', {},
        h('strong', {}, r.name),
        h('p', { class: 'muted' }, r.desc),
        h('p', { class: 'muted small-text' }, `約${routineMinutes(r)}分・${r.ids.length}種目：${r.ids.map((i) => exById(i).name).join('、')}`)),
      h('span', { class: 'go', 'aria-hidden': 'true' }, '›'))));

  const safety = h('details', { class: 'card' },
    h('summary', {}, '受診をおすすめする目安'),
    h('p', { class: 'muted' }, '次のような場合は、セルフケアを続けず、医療機関（整形外科など）に相談してください。'),
    h('ul', { class: 'plain' }, SAFETY.map((t) => h('li', {}, t))),
    h('p', { class: 'muted small-text' }, 'このアプリは診断や治療の代わりにはなりません。痛みが強くなる動きは無理に行わず、「気持ちいい」範囲で行ってください。'));

  const install = !isStandalone() && h('details', { class: 'card' },
    h('summary', {}, 'ホーム画面に追加する方法'),
    isIOS()
      ? h('p', {}, 'Safari の下にある共有ボタン（□に↑）をタップ →「ホーム画面に追加」を選びます。')
      : h('p', {}, 'Chrome の右上メニュー（︙）→「ホーム画面に追加」または「アプリをインストール」を選びます。'),
    h('p', { class: 'muted small-text' }, '追加すると、アプリのように全画面で開けます。'));

  return h('div', { class: 'view' }, hero, notice, check, routines, safety, install);
}

const sameDay = (a, b) => ymd(a) === ymd(b);
const stat = (n, label) => h('div', { class: 'stat' }, h('b', {}, String(n)), h('span', {}, label));
const pill = (cls, label, v) => h('div', { class: 'pill' }, h('span', { class: `dot ${cls}` }), label, h('b', {}, String(v)), h('span', { class: 'muted' }, painWord(v)));
