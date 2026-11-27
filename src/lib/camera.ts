import { CAMERA_AWAY_MS, CAMERA_RESUME_STREAK } from '../constants';

/** 顔検出の結果から「いる / いない」を決める（映像は使わず、見えたかどうかだけ） */
export interface PresenceTracker {
  present: boolean;
  /** 最後に顔が見えた時刻 */
  lastSeenAt: number;
  /** 続けて見えた回数 */
  streak: number;
}

/** カメラをつけた時点では「いる」とみなす */
export function startTracker(now: number): PresenceTracker {
  return { present: true, lastSeenAt: now, streak: 0 };
}

/**
 * 1 回分の検出結果を反映する。
 * - いる → いない：最後に見えてから CAMERA_AWAY_MS 経ったら
 * - いない → いる：CAMERA_RESUME_STREAK 回続けて見えたら
 */
export function observe(t: PresenceTracker, faceSeen: boolean, now: number): PresenceTracker {
  if (faceSeen) {
    const streak = t.streak + 1;
    return { present: t.present || streak >= CAMERA_RESUME_STREAK, lastSeenAt: now, streak };
  }
  return { present: t.present && now - t.lastSeenAt < CAMERA_AWAY_MS, lastSeenAt: t.lastSeenAt, streak: 0 };
}
