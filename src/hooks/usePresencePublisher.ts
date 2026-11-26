import { useEffect, useRef } from 'react';
import type { Backend } from '../backend';
import { PRESENCE_HEARTBEAT_MS } from '../constants';
import type { Presence, Room, UserProfile } from '../types';
import type { ActiveTimer } from './useStudyTimer';

/**
 * 自分の状態を、参加しているすべての部屋に送る。
 * 状態が変わったときだけ送り、あとは「開いている」ことを伝えるために 1 分に 1 回だけ送り直す。
 */
export function usePresencePublisher(
  backend: Backend,
  profile: UserProfile,
  rooms: Room[],
  timer: ActiveTimer | null,
) {
  const presence: Omit<Presence, 'updatedAt'> = {
    uid: profile.uid,
    displayName: profile.displayName,
    avatar: profile.avatar,
    status: timer ? (timer.segmentStartedAt ? 'studying' : 'break') : 'away',
    category: timer?.category ?? null,
    startedAt: timer?.segmentStartedAt ?? null,
    accumulatedSec: timer ? Math.round(timer.accumulatedSec) : 0,
  };
  const presenceKey = JSON.stringify(presence);
  const roomKey = rooms.map((r) => r.id).join(',');

  const latest = useRef({ presence, rooms });
  latest.current = { presence, rooms };

  useEffect(() => {
    const send = (override?: Partial<Presence>) => {
      const { presence: p, rooms: rs } = latest.current;
      const data: Presence = { ...p, ...override, updatedAt: Date.now() };
      rs.forEach((r) => backend.setPresence(r.id, data).catch((e) => console.warn('presence', e)));
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
  }, [backend, presenceKey, roomKey]);
}
