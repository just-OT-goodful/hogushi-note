// バックアップ（共有シート／ファイル保存）・バックアップのお知らせ・永続ストレージの要求
import { get, update, exportJSON, setSaveHook, ymd } from './store.js';
import { downloadFile } from './reminder.js';

const DAY = 86400000;

// ---- 永続ストレージ（ブラウザに「容量不足でも消さないで」と頼む） ----
let asked = false;
export async function ensurePersist() {
  if (asked) return;
  const s = get();
  if (!s.logs.length && !s.checkins.length) return; // 記録ができてから頼む
  asked = true;
  try { await navigator.storage?.persist?.(); } catch { /* 非対応・拒否でも続行 */ }
}
setSaveHook(ensurePersist);

export async function persistStatus() {
  try {
    if (!navigator.storage?.persisted) return 'unknown';
    return (await navigator.storage.persisted()) ? 'yes' : 'no';
  } catch { return 'unknown'; }
}

// ---- バックアップ ----
// 共有シートに対応する端末では共有画面を開き、そうでなければファイルとして保存する
export async function backupNow() {
  const name = `hogushi-backup-${ymd(new Date())}.json`;
  const text = exportJSON();
  let result = 'downloaded';
  try {
    const file = new File([text], name, { type: 'application/json' });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: 'ほぐしノートのバックアップ' });
      result = 'shared';
    } else {
      downloadFile(name, text, 'application/json');
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return 'cancelled'; // 共有画面を閉じただけ
    downloadFile(name, text, 'application/json');
  }
  update((s) => { s.meta.lastBackup = Date.now(); s.meta.snoozeUntil = 0; });
  return result;
}

export function daysSinceBackup() {
  const t = get().meta.lastBackup;
  return t ? Math.floor((Date.now() - t) / DAY) : null;
}

// ホームでバックアップを促すか（記録が5件以上あり、最後のバックアップから30日／未実施なら記録から14日）
export function backupNudge() {
  const s = get();
  const n = s.logs.length + s.checkins.length;
  if (n < 5 || Date.now() < s.meta.snoozeUntil) return null;
  if (s.meta.lastBackup) {
    const d = Math.floor((Date.now() - s.meta.lastBackup) / DAY);
    return d >= 30 ? { never: false, days: d } : null;
  }
  const oldest = Math.min(...s.logs.map((l) => l.ts), ...s.checkins.map((c) => c.ts));
  const d = Math.floor((Date.now() - oldest) / DAY);
  return d >= 14 ? { never: true, days: d } : null;
}

export const snoozeBackupNudge = (days = 7) => update((s) => { s.meta.snoozeUntil = Date.now() + days * DAY; });
