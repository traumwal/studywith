import { useEffect, useRef } from 'react';
import type { Backend } from '../backend';
import { PRESENCE_HEARTBEAT_MS } from '../constants';
import type { Presence, UserProfile } from '../types';
import type { ActiveTimer } from './useStudyTimer';

/**
 * 自分の状態を「入っている部屋」（ヘッダーで選んでいる部屋）にだけ送る。
 * 同時に入れる部屋は 1 つで、部屋を切り替えたら前の部屋には「オフライン」を送る。
 * 状態が変わったときだけ送り、あとは「開いている」ことを伝えるために 1 分に 1 回だけ送り直す。
 */
export function usePresencePublisher(
  backend: Backend,
  profile: UserProfile,
  roomId: string | null,
  timer: ActiveTimer | null,
) {
  const presence: Omit<Presence, 'updatedAt'> = {
    uid: profile.uid,
    displayName: profile.displayName,
    avatar: profile.avatar,
    // カメラが離席と判定して止めたときは、休憩ではなく「離席中」（空席）にする
    status: timer ? (timer.segmentStartedAt ? 'studying' : timer.pausedBy === 'camera' ? 'away' : 'break') : 'away',
    category: timer?.category ?? null,
    startedAt: timer?.segmentStartedAt ?? null,
    accumulatedSec: timer ? Math.round(timer.accumulatedSec) : 0,
  };
  const presenceKey = JSON.stringify(presence);

  const latest = useRef(presence);
  latest.current = presence;

  // 部屋を出る（切り替える・ログアウトする）ときは、その部屋に「オフライン」を送る
  useEffect(() => {
    if (!roomId) return;
    return () => {
      const data: Presence = { ...latest.current, status: 'offline', startedAt: null, updatedAt: Date.now() };
      backend.setPresence(roomId, data).catch((e) => console.warn('presence', e));
    };
  }, [backend, roomId]);

  useEffect(() => {
    if (!roomId) return;
    const send = (override?: Partial<Presence>) => {
      const data: Presence = { ...latest.current, ...override, updatedAt: Date.now() };
      backend.setPresence(roomId, data).catch((e) => console.warn('presence', e));
    };
    send();
    const heartbeat = setInterval(() => send(), PRESENCE_HEARTBEAT_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') send();
    };
    // 閉じるときは「オフライン」を送る（届かなくても一定時間でオフライン扱いになる）
    const onHide = () => send({ status: 'offline', startedAt: null });
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pagehide', onHide);
    return () => {
      clearInterval(heartbeat);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pagehide', onHide);
    };
  }, [backend, presenceKey, roomId]);
}
