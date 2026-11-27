import type { Backend } from '../backend';
import { TIMELINE_KEEP_MS } from '../constants';
import type { StudySession } from '../types';

/**
 * 記録を保存し、入っている部屋のタイムラインにも「分野と開始・終了時刻だけ」をコピーする。
 * 記録そのもの（sessions）は本人だけが読めるまま。
 */
export async function saveSession(backend: Backend, uid: string, roomId: string | null, session: Omit<StudySession, 'id' | 'roomId'>) {
  // 2 日より前の記録（つけ忘れの手動追加など）は、すぐ消えるのでコピーしない
  const share = roomId && session.endedAt > Date.now() - TIMELINE_KEEP_MS ? roomId : null;
  const id = await backend.addSession(uid, share ? { ...session, roomId: share } : session);
  if (share) {
    await backend
      .addTimeline(share, { id, userId: uid, category: session.category, startedAt: session.startedAt, endedAt: session.endedAt })
      .catch((e) => console.warn('timeline', e));
  }
  return id;
}

/** 記録を削除し、タイムラインのコピーも消す（もう消えている・部屋を出た場合は気にしない） */
export async function removeSession(backend: Backend, uid: string, session: StudySession) {
  await backend.deleteSession(uid, session.id);
  if (session.roomId) await backend.deleteTimeline(session.roomId, session.id).catch(() => {});
}
