import { useCallback, useEffect, useState } from 'react';

/** 進行中の勉強。リロードしても消えないよう localStorage に置く */
export interface ActiveTimer {
  category: string;
  /** セッション全体の開始時刻 */
  startedAt: number;
  /** 休憩を除いた、今の区間より前の勉強秒数 */
  accumulatedSec: number;
  /** 今の勉強区間の開始時刻。休憩中は null */
  segmentStartedAt: number | null;
}

export interface FinishedTimer {
  category: string;
  startedAt: number;
  endedAt: number;
  durationSec: number;
}

const key = (uid: string) => `studyroom:v1:timer:${uid}`;

function load(uid: string): ActiveTimer | null {
  try {
    const raw = localStorage.getItem(key(uid));
    return raw ? (JSON.parse(raw) as ActiveTimer) : null;
  } catch {
    return null;
  }
}

export function elapsedSec(t: ActiveTimer, now = Date.now()): number {
  const running = t.segmentStartedAt ? (now - t.segmentStartedAt) / 1000 : 0;
  return t.accumulatedSec + Math.max(0, running);
}

export function useStudyTimer(uid: string) {
  const [timer, setTimerState] = useState<ActiveTimer | null>(() => load(uid));

  useEffect(() => setTimerState(load(uid)), [uid]);

  const setTimer = useCallback(
    (next: ActiveTimer | null) => {
      if (next) localStorage.setItem(key(uid), JSON.stringify(next));
      else localStorage.removeItem(key(uid));
      setTimerState(next);
    },
    [uid],
  );

  const start = useCallback(
    (category: string) => {
      const now = Date.now();
      setTimer({ category, startedAt: now, accumulatedSec: 0, segmentStartedAt: now });
    },
    [setTimer],
  );

  const pause = useCallback(() => {
    if (!timer || !timer.segmentStartedAt) return;
    setTimer({ ...timer, accumulatedSec: elapsedSec(timer), segmentStartedAt: null });
  }, [timer, setTimer]);

  const resume = useCallback(() => {
    if (!timer || timer.segmentStartedAt) return;
    setTimer({ ...timer, segmentStartedAt: Date.now() });
  }, [timer, setTimer]);

  const changeCategory = useCallback(
    (category: string) => {
      if (timer) setTimer({ ...timer, category });
    },
    [timer, setTimer],
  );

  /** 止めて、保存すべき記録を返す */
  const stop = useCallback((): FinishedTimer | null => {
    if (!timer) return null;
    const endedAt = Date.now();
    const result = {
      category: timer.category,
      startedAt: timer.startedAt,
      endedAt,
      durationSec: Math.round(elapsedSec(timer, endedAt)),
    };
    setTimer(null);
    return result;
  }, [timer, setTimer]);

  return { timer, start, pause, resume, stop, changeCategory };
}

/** 1秒ごとに再描画したいとき用 */
export function useNow(intervalMs = 1000, enabled = true) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, enabled]);
  return now;
}
