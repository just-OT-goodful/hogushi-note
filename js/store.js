// データ保存（localStorage ＋ 写真・動画は IndexedDB）。すべて端末内に保存され、外部には送信されません。
const KEY = 'selfcare.v1';

const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const WEEK = ['日', '月', '火', '水', '木', '金', '土'];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

const defaults = () => ({
  logs: [],        // { id, ex, ts }            セルフケアをした記録
  checkins: [],    // { id, ts, neck, back, note, after }  こり・痛みの記録（0〜10）
  remind: { enabled: false, times: ['09:30', '12:30', '15:30'], days: [1, 2, 3, 4, 5] },
  links: {},       // { [exId]: [url] }         動画リンク（YouTubeなど）
  fired: {},       // 通知済みの記録（重複防止）
  meta: { lastBackup: 0, snoozeUntil: 0, introSeen: false }, // バックアップ日・お知らせの保留・初回説明の表示済み
});

// ---- 読み込んだデータの検証（壊れたデータ・細工されたバックアップから守る） ----
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const URL_RE = /^https?:\/\//i;

function cleanLogs(arr) {
  const seen = new Set();
  return (Array.isArray(arr) ? arr : []).filter((l) => {
    if (!l || typeof l.id !== 'string' || typeof l.ex !== 'string' || !Number.isFinite(l.ts) || l.ts <= 0 || seen.has(l.id)) return false;
    seen.add(l.id);
    return true;
  }).map((l) => ({ id: l.id.slice(0, 40), ex: l.ex.slice(0, 64), ts: l.ts }));
}

function cleanCheckins(arr) {
  const seen = new Set();
  const out = [];
  for (const c of Array.isArray(arr) ? arr : []) {
    if (!c || typeof c.id !== 'string' || !Number.isFinite(c.ts) || c.ts <= 0 || seen.has(c.id)) continue;
    const neck = c.neck == null || c.neck === '' ? NaN : Number(c.neck);
    const back = c.back == null || c.back === '' ? NaN : Number(c.back);
    if (!Number.isFinite(neck) || !Number.isFinite(back)) continue;
    seen.add(c.id);
    out.push({
      id: c.id.slice(0, 40), ts: c.ts,
      neck: Math.min(10, Math.max(0, neck)), back: Math.min(10, Math.max(0, back)),
      note: typeof c.note === 'string' ? c.note.slice(0, 80) : '', after: c.after === true,
    });
  }
  return out;
}

function cleanRemind(r) {
  const d = defaults().remind;
  if (!r || typeof r !== 'object') return d;
  const times = Array.isArray(r.times) ? [...new Set(r.times.filter((t) => typeof t === 'string' && TIME_RE.test(t)))].sort() : d.times;
  const days = Array.isArray(r.days) ? [...new Set(r.days.filter((x) => Number.isInteger(x) && x >= 0 && x <= 6))] : d.days;
  return { enabled: r.enabled === true, times, days };
}

function cleanLinks(o) {
  const out = {};
  if (!o || typeof o !== 'object' || Array.isArray(o)) return out;
  for (const [k, v] of Object.entries(o)) {
    if (Array.isArray(v)) out[k] = v.filter((u) => typeof u === 'string' && URL_RE.test(u)).slice(0, 20);
  }
  return out;
}

function cleanMeta(m) {
  const num = (v) => (Number.isFinite(v) && v > 0 ? v : 0);
  return { lastBackup: num(m?.lastBackup), snoozeUntil: num(m?.snoozeUntil), introSeen: m?.introSeen === true };
}

function sanitize(s) {
  return {
    meta: cleanMeta(s.meta),
    logs: cleanLogs(s.logs), checkins: cleanCheckins(s.checkins), remind: cleanRemind(s.remind),
    links: cleanLinks(s.links), fired: s.fired && typeof s.fired === 'object' && !Array.isArray(s.fired) ? s.fired : {},
  };
}

let state;
try {
  const raw = localStorage.getItem(KEY);
  state = raw ? sanitize({ ...defaults(), ...JSON.parse(raw) }) : defaults();
} catch {
  state = defaults();
}

let onSaveError = null;
export const setSaveErrorHandler = (fn) => { onSaveError = fn; };
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { onSaveError?.(); /* 容量超過・プライベートモード等 */ }
}

let saveHook = null;
export const setSaveHook = (fn) => { saveHook = fn; };

export const get = () => state;
export function update(fn) { fn(state); save(); saveHook?.(); }

// ---- 記録 ----
export function addLog(ex) {
  const log = { id: uid(), ex, ts: Date.now() };
  update((s) => s.logs.push(log));
  return log;
}
export const removeLog = (id) => update((s) => { s.logs = s.logs.filter((l) => l.id !== id); });

export function addCheckin({ neck, back, note = '', after = false }) {
  const c = { id: uid(), ts: Date.now(), neck, back, note, after };
  update((s) => s.checkins.push(c));
  return c;
}
export const removeCheckin = (id) => update((s) => { s.checkins = s.checkins.filter((c) => c.id !== id); });

// ---- 集計 ----
export const logsOn = (date) => state.logs.filter((l) => ymd(new Date(l.ts)) === date);
export const checkinsOn = (date) => state.checkins.filter((c) => ymd(new Date(c.ts)) === date);

export function dayCounts() {
  const m = {};
  for (const l of state.logs) { const k = ymd(new Date(l.ts)); m[k] = (m[k] || 0) + 1; }
  return m;
}

// 連続してセルフケアをした日数（今日まだなら昨日までの連続を数える）
export function streak() {
  const m = dayCounts();
  let d = new Date();
  if (!m[ymd(d)]) d = addDays(d, -1);
  let n = 0;
  while (m[ymd(d)]) { n++; d = addDays(d, -1); }
  return n;
}

// 直近 n 日分の日付（古い順）。offset 日ぶん過去へずらせる
export function rangeDates(n, offset = 0) {
  const out = [];
  const end = addDays(new Date(), -offset);
  for (let i = n - 1; i >= 0; i--) out.push(ymd(addDays(end, -i)));
  return out;
}

export const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);

// 日付ごとの平均値（key: 'neck' | 'back'）。記録のない日は null
export function dailyMean(key, dates) {
  const by = {};
  for (const c of state.checkins) {
    const k = ymd(new Date(c.ts));
    (by[k] ||= []).push(c[key]);
  }
  return dates.map((d) => (by[d] ? mean(by[d]) : null));
}

// ケア直後のチェックイン（after=true）と、その直前の記録との差の平均
export function afterCareEffect() {
  const sorted = [...state.checkins].sort((a, b) => a.ts - b.ts);
  const diffs = { neck: [], back: [] };
  sorted.forEach((c, i) => {
    if (!c.after) return;
    for (let j = i - 1; j >= 0; j--) {
      if (c.ts - sorted[j].ts > 3 * 3600 * 1000) break;
      if (!sorted[j].after) {
        diffs.neck.push(c.neck - sorted[j].neck);
        diffs.back.push(c.back - sorted[j].back);
        break;
      }
    }
  });
  return { n: diffs.neck.length, neck: mean(diffs.neck), back: mean(diffs.back) };
}

// ---- バックアップ ----
export function exportJSON() {
  const { logs, checkins, remind, links } = state;
  return JSON.stringify({ app: 'selfcare', version: 1, exportedAt: new Date().toISOString(), logs, checkins, remind, links }, null, 2);
}

export function importJSON(text) {
  const d = JSON.parse(text);
  if (!d || d.app !== 'selfcare' || !Array.isArray(d.logs) || !Array.isArray(d.checkins)) throw new Error('形式が違います');
  const logs = cleanLogs(d.logs);
  const checkins = cleanCheckins(d.checkins);
  update((s) => {
    const have = new Set(s.logs.map((l) => l.id));
    logs.forEach((l) => { if (!have.has(l.id)) s.logs.push(l); });
    const haveC = new Set(s.checkins.map((c) => c.id));
    checkins.forEach((c) => { if (!haveC.has(c.id)) s.checkins.push(c); });
    s.logs.sort((a, b) => a.ts - b.ts);
    s.checkins.sort((a, b) => a.ts - b.ts);
    if (d.remind) s.remind = cleanRemind({ ...s.remind, ...d.remind });
    if (d.links) s.links = cleanLinks({ ...s.links, ...d.links });
  });
  return { logs: logs.length, checkins: checkins.length, skipped: d.logs.length + d.checkins.length - logs.length - checkins.length };
}

export function resetAll() {
  state = defaults();
  save();
}
// ---- 写真・動画（IndexedDB） ----
const DB = 'selfcare-media';
const openDB = () => new Promise((res, rej) => {
  const r = indexedDB.open(DB, 1);
  r.onupgradeneeded = () => r.result.createObjectStore('files', { keyPath: 'id' });
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
});
const tx = (db, mode, fn) => new Promise((res, rej) => {
  const t = db.transaction('files', mode);
  const req = fn(t.objectStore('files'));
  t.oncomplete = () => res(req && req.result);
  t.onerror = () => rej(t.error);
});

export async function addMedia(ex, file) {
  const db = await openDB();
  const rec = { id: uid(), ex, name: file.name, type: file.type, blob: file, ts: Date.now() };
  await tx(db, 'readwrite', (s) => s.put(rec));
  return rec;
}
export async function listMedia(ex) {
  const db = await openDB();
  const all = (await tx(db, 'readonly', (s) => s.getAll())) || [];
  return all.filter((r) => r.ex === ex).sort((a, b) => a.ts - b.ts);
}
export async function deleteMedia(id) {
  const db = await openDB();
  await tx(db, 'readwrite', (s) => s.delete(id));
}
