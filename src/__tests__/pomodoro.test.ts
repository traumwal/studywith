import { describe, expect, it } from 'vitest';
import { elapsedSec, type ActiveTimer } from '../hooks/useStudyTimer';
import { advancePomodoro, isLongBreak, pausePomodoro, pomodoroRemainingMs, resumePomodoro, startPomodoro } from '../lib/pomodoro';

const MIN = 60 * 1000;
const T0 = 1_800_000_000_000;

function started(preset: '25-5' | '50-10' = '25-5'): ActiveTimer {
  return { category: '英語', startedAt: T0, accumulatedSec: 0, segmentStartedAt: T0, pomodoro: startPomodoro(preset, T0) };
}

describe('pomodoro', () => {
  it('switches to a break when focus ends, and back to focus after the break', () => {
    const a = advancePomodoro(started(), T0 + 25 * MIN);
    expect(a.events).toEqual([{ kind: 'break', at: T0 + 25 * MIN, long: false }]);
    expect(a.timer.segmentStartedAt).toBeNull();
    expect(a.timer.accumulatedSec).toBe(25 * 60);
    expect(a.timer.pomodoro).toMatchObject({ phase: 'break', round: 1, phaseEndsAt: T0 + 30 * MIN });

    const b = advancePomodoro(a.timer, T0 + 30 * MIN);
    expect(b.events.map((e) => e.kind)).toEqual(['focus']);
    expect(b.timer.segmentStartedAt).toBe(T0 + 30 * MIN);
    expect(b.timer.pomodoro).toMatchObject({ phase: 'focus', round: 2 });
  });

  it('does nothing before the phase ends', () => {
    const t = started();
    expect(advancePomodoro(t, T0 + 24 * MIN)).toEqual({ timer: t, events: [] });
  });

  it('catches up exactly after the tab was closed for a long time, excluding breaks', () => {
    // 25+5 を 3 回 ＋ 4 回目の集中の途中（3 時間後ではなく 100 分後）
    const { timer, events } = advancePomodoro(started(), T0 + 100 * MIN);
    expect(events.map((e) => e.kind)).toEqual(['break', 'focus', 'break', 'focus', 'break', 'focus']);
    expect(timer.pomodoro).toMatchObject({ phase: 'focus', round: 4, phaseEndsAt: T0 + 115 * MIN });
    // 勉強時間は集中の分だけ：25×3 ＋ 4 回目の 10 分
    expect(Math.round(elapsedSec(timer, T0 + 100 * MIN))).toBe(85 * 60);
  });

  it('takes a long break after every 4th focus', () => {
    expect(isLongBreak('25-5', 4)).toBe(true);
    expect(isLongBreak('25-5', 3)).toBe(false);
    const { timer, events } = advancePomodoro(started(), T0 + (4 * 25 + 3 * 5) * MIN);
    expect(events.at(-1)).toMatchObject({ kind: 'break', long: true });
    expect(timer.pomodoro!.phaseEndsAt).toBe(T0 + (4 * 25 + 3 * 5 + 15) * MIN);
  });

  it('freezes the remaining focus time while paused by hand', () => {
    const paused = pausePomodoro(startPomodoro('25-5', T0), T0 + 10 * MIN);
    expect(paused).toMatchObject({ phaseEndsAt: null, remainingMs: 15 * MIN });
    expect(pomodoroRemainingMs(paused, T0 + 60 * MIN)).toBe(15 * MIN);
    const resumed = resumePomodoro(paused, T0 + 60 * MIN);
    expect(resumed).toMatchObject({ phase: 'focus', round: 1, phaseEndsAt: T0 + 75 * MIN, remainingMs: null });
  });

  it('cuts a break short and starts the next focus', () => {
    const { timer } = advancePomodoro(started('50-10'), T0 + 52 * MIN);
    const next = resumePomodoro(timer.pomodoro!, T0 + 52 * MIN);
    expect(next).toMatchObject({ phase: 'focus', round: 2, phaseEndsAt: T0 + 102 * MIN });
  });
});
