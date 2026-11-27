import { POMODORO_PRESETS, type PomodoroPresetId } from '../constants';
import type { ActiveTimer } from '../hooks/useStudyTimer';

const MIN = 60 * 1000;

/** ポモドーロの進み具合（ActiveTimer に入れて localStorage に保存する） */
export interface PomodoroState {
  preset: PomodoroPresetId;
  phase: 'focus' | 'break';
  /** 何回目の集中か（1 から） */
  round: number;
  /** 今の区間が終わる時刻。手動で一時停止している間は null */
  phaseEndsAt: number | null;
  /** 手動で一時停止したときの、集中の残り時間 */
  remainingMs: number | null;
}

export interface PomodoroEvent {
  kind: 'break' | 'focus';
  at: number;
  long: boolean;
}

export function presetOf(id: PomodoroPresetId) {
  return POMODORO_PRESETS.find((p) => p.id === id) ?? POMODORO_PRESETS[0];
}

export function startPomodoro(id: PomodoroPresetId, now: number): PomodoroState {
  return { preset: id, phase: 'focus', round: 1, phaseEndsAt: now + presetOf(id).focusMin * MIN, remainingMs: null };
}

/** round 回目の集中のあとの休憩が長い休憩か */
export function isLongBreak(id: PomodoroPresetId, round: number) {
  return round % presetOf(id).every === 0;
}

function breakMs(id: PomodoroPresetId, round: number) {
  const p = presetOf(id);
  return (isLongBreak(id, round) ? p.longBreakMin : p.breakMin) * MIN;
}

/**
 * now までに終わった区間を順に進める（閉じていて何区間も過ぎていても正確に追いつく）。
 * 休憩は勉強時間に含めないので、集中が終わった時刻までを accumulatedSec に足す。
 */
export function advancePomodoro(timer: ActiveTimer, now: number): { timer: ActiveTimer; events: PomodoroEvent[] } {
  let t = timer;
  const events: PomodoroEvent[] = [];
  for (let guard = 0; guard < 1000; guard++) {
    const p = t.pomodoro;
    if (!p || p.phaseEndsAt === null || now < p.phaseEndsAt) break;
    const end = p.phaseEndsAt;
    if (p.phase === 'focus') {
      const ran = t.segmentStartedAt ? (end - t.segmentStartedAt) / 1000 : 0;
      t = {
        ...t,
        accumulatedSec: t.accumulatedSec + Math.max(0, ran),
        segmentStartedAt: null,
        pomodoro: { ...p, phase: 'break', phaseEndsAt: end + breakMs(p.preset, p.round) },
      };
      events.push({ kind: 'break', at: end, long: isLongBreak(p.preset, p.round) });
    } else {
      t = {
        ...t,
        segmentStartedAt: end,
        pomodoro: { ...p, phase: 'focus', round: p.round + 1, phaseEndsAt: end + presetOf(p.preset).focusMin * MIN },
      };
      events.push({ kind: 'focus', at: end, long: false });
    }
  }
  return { timer: t, events };
}

/** 集中中に手動で休憩したら、ポモドーロも止める */
export function pausePomodoro(p: PomodoroState, now: number): PomodoroState {
  if (p.phase !== 'focus' || p.phaseEndsAt === null) return p;
  return { ...p, phaseEndsAt: null, remainingMs: Math.max(0, p.phaseEndsAt - now) };
}

/** 一時停止からの再開は残りから。休憩中に押したら休憩を切り上げて次の集中へ */
export function resumePomodoro(p: PomodoroState, now: number): PomodoroState {
  if (p.phase === 'break') {
    return { ...p, phase: 'focus', round: p.round + 1, phaseEndsAt: now + presetOf(p.preset).focusMin * MIN, remainingMs: null };
  }
  if (p.phaseEndsAt !== null) return p;
  return { ...p, phaseEndsAt: now + (p.remainingMs ?? presetOf(p.preset).focusMin * MIN), remainingMs: null };
}

/** 今の区間の残り時間（ミリ秒） */
export function pomodoroRemainingMs(p: PomodoroState, now: number) {
  return p.phaseEndsAt === null ? (p.remainingMs ?? 0) : Math.max(0, p.phaseEndsAt - now);
}
