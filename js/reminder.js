// リマインド：アプリを開いている間の通知 ＋ カレンダー(.ics)書き出し
// ※ Webアプリは仕様上、アプリを閉じている間に決まった時刻で通知を出すことができません。
//    確実に知らせたいときは、.ics をスマホのカレンダーに登録してください。
import { get, update, ymd, addDays } from './store.js';

export const supported = 'Notification' in window;

export async function requestPermission() {
  if (!supported) return 'unsupported';
  return Notification.requestPermission();
}

export async function notify(title, body) {
  if (!supported || Notification.permission !== 'granted') return false;
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) {
      await reg.showNotification(title, { body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: 'selfcare', data: { url: './' } });
    } else {
      new Notification(title, { body, icon: 'icons/icon-192.png' });
    }
    return true;
  } catch {
    return false;
  }
}

const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

// いま通知すべき時刻（予定から30分以内で、まだ通知していないもの）
export function dueReminders(now = new Date()) {
  const r = get().remind;
  if (!r.enabled || !r.days.includes(now.getDay())) return [];
  const today = ymd(now);
  const mins = now.getHours() * 60 + now.getMinutes();
  return r.times.filter((t) => mins >= toMin(t) && mins - toMin(t) <= 30 && !get().fired[`${today} ${t}`]);
}

export function markFired(times, now = new Date()) {
  update((s) => {
    for (const t of times) s.fired[`${ymd(now)} ${t}`] = 1;
    const keys = Object.keys(s.fired).sort();
    if (keys.length > 60) keys.slice(0, keys.length - 60).forEach((k) => delete s.fired[k]);
  });
}

// 次のリマインド予定（なければ null）
export function nextReminder(now = new Date()) {
  const r = get().remind;
  if (!r.enabled || !r.times.length || !r.days.length) return null;
  const times = [...r.times].sort();
  for (let off = 0; off <= 7; off++) {
    const d = addDays(now, off);
    if (!r.days.includes(d.getDay())) continue;
    for (const t of times) {
      const [hh, mm] = t.split(':').map(Number);
      const dt = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh, mm);
      if (dt > now) return dt;
    }
  }
  return null;
}

// ---- カレンダー(.ics) ----
const ICS_DAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const p2 = (n) => String(n).padStart(2, '0');
const icsDT = (d) => `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}T${p2(d.getHours())}${p2(d.getMinutes())}00`;

export function buildICS(url) {
  const r = get().remind;
  const now = new Date();
  const stamp = `${now.getUTCFullYear()}${p2(now.getUTCMonth() + 1)}${p2(now.getUTCDate())}T${p2(now.getUTCHours())}${p2(now.getUTCMinutes())}00Z`;
  const byday = r.days.map((d) => ICS_DAY[d]).join(',');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//selfcare//JA', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:セルフケアの時間'];
  r.times.forEach((t, i) => {
    let first = new Date();
    for (let k = 0; k < 8; k++) { if (r.days.includes(first.getDay())) break; first = addDays(first, 1); }
    const [hh, mm] = t.split(':').map(Number);
    const start = new Date(first.getFullYear(), first.getMonth(), first.getDate(), hh, mm);
    const end = new Date(start.getTime() + 10 * 60000);
    lines.push(
      'BEGIN:VEVENT',
      `UID:selfcare-${i}-${t.replace(':', '')}@selfcare.local`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${icsDT(start)}`,
      `DTEND:${icsDT(end)}`,
      `RRULE:FREQ=WEEKLY;BYDAY=${byday}`,
      'SUMMARY:セルフケアの時間（肩・腰）',
      `DESCRIPTION:体を動かす時間です。${url}`,
      `URL:${url}`,
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:セルフケアの時間です', 'TRIGGER:PT0M', 'END:VALARM',
      'END:VEVENT',
    );
  });
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

export function downloadFile(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
