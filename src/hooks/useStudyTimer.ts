import { useCallback, useEffect, useRef, useState } from 'react';
import type { PomodoroPresetId } from '../constants';
import { advancePomodoro, pausePomodoro, resumePomodoro, startPomodoro, type PomodoroEvent, type PomodoroState } from '../lib/pomodoro';

/** 進行中の勉強。リロードしても消えないよう localStorage に置く */
export interface ActiveTimer {
  category: string;
  /** セッション全体の開始時刻 */
  startedAt: number;
  /** 休憩を除いた、今の区間より前の勉強秒数 */
  accumulatedSec: number;
  /** 今の勉強区間の開始時刻。休憩中は null */
  segmentStartedAt: number | null;
  /** ポモドーロで始めたときだけ */
  pomodoro?: PomodoroState;
  /** カメラが「離席」と判定して一時停止したとき（手動の休憩と区別する） */
  pausedBy?: 'camera';
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

/**
 * @param onPomodoro ポモドーロで集中 ⇔ 休憩が自動で切り替わったときに呼ばれる
 *                   （閉じている間に何回も切り替わっていたら、まとめて渡す）
 */
export function useStudyTimer(uid: string, onPomodoro?: (events: PomodoroEvent[], timer: ActiveTimer) => void) {
  const [timer, setTimerState] = useState<ActiveTimer | null>(() => load(uid));
  const onPomodoroRef = useRef(onPomodoro);
  onPomodoroRef.current = onPomodoro;

  useEffect(() => setTimerState(load(uid)), [uid]);

  const setTimer = useCallback(
    (next: ActiveTimer | null) => {
      if (next) localStorage.setItem(key(uid), JSON.stringify(next));
      else localStorage.removeItem(key(uid));
      setTimerState(next);
    },
    [uid],
  );

  // ポモドーロ：区間が終わったら自動で切り替える。
  // タブが隠れている間はタイマーが遅れるので、見えるようになったときにも追いつかせる
  useEffect(() => {
    if (!timer?.pomodoro) return;
    const check = () => {
      const { timer: next, events } = advancePomodoro(timer, Date.now());
      if (!events.length) return;
      setTimer(next);
      onPomodoroRef.current?.(events, next);
    };
    check();
    const id = setInterval(check, 1000);
    document.addEventListener('visibilitychange', check);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', check);
    };
  }, [timer, setTimer]);

  const start = useCallback(
    (category: string, pomodoro?: PomodoroPresetId) => {
      const now = Date.now();
      setTimer({
        category,
        startedAt: now,
        accumulatedSec: 0,
        segmentStartedAt: now,
        ...(pomodoro ? { pomodoro: startPomodoro(pomodoro, now) } : {}),
      });
    },
    [setTimer],
  );

  /**
   * 一時停止。カメラの離席は、最後に顔が見えた時刻（at）までを勉強時間にする
   * （いなかった 3 分間を数えないように）
   */
  const pause = useCallback(
    (opts?: { by?: 'camera'; at?: number }) => {
      if (!timer || !timer.segmentStartedAt) return;
      const at = Math.max(timer.segmentStartedAt, Math.min(Date.now(), opts?.at ?? Date.now()));
      setTimer({
        ...timer,
        accumulatedSec: elapsedSec(timer, at),
        segmentStartedAt: null,
        ...(timer.pomodoro ? { pomodoro: pausePomodoro(timer.pomodoro, at) } : {}),
        ...(opts?.by ? { pausedBy: opts.by } : {}),
      });
    },
    [timer, setTimer],
  );

  const resume = useCallback(() => {
    if (!timer || timer.segmentStartedAt) return;
    const now = Date.now();
    const { pausedBy: _, ...rest } = timer;
    setTimer({
      ...rest,
      segmentStartedAt: now,
      ...(timer.pomodoro ? { pomodoro: resumePomodoro(timer.pomodoro, now) } : {}),
    });
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
    // ポモドーロの集中が終わった直後に押された場合も、休憩に入った分は数えない
    const settled = timer.pomodoro ? advancePomodoro(timer, endedAt).timer : timer;
    const result = {
      category: settled.category,
      startedAt: settled.startedAt,
      endedAt,
      durationSec: Math.round(elapsedSec(settled, endedAt)),
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
