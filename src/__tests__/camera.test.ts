import { describe, expect, it } from 'vitest';
import { CAMERA_AWAY_MS, CAMERA_DETECT_INTERVAL_MS } from '../constants';
import { observe, startTracker } from '../lib/camera';

const STEP = CAMERA_DETECT_INTERVAL_MS;

describe('camera presence', () => {
  it('stays present while the face is seen, and through short absences', () => {
    let t = startTracker(0);
    t = observe(t, true, STEP);
    expect(t).toMatchObject({ present: true, lastSeenAt: STEP });
    // 1 分ほど映らなくても（下を向いて書いている・席を少し外す）離席にはしない
    t = observe(t, false, STEP + 60_000);
    expect(t.present).toBe(true);
  });

  it('becomes absent after the face is not seen for the away time', () => {
    let t = observe(startTracker(0), true, 0);
    t = observe(t, false, CAMERA_AWAY_MS - 1);
    expect(t.present).toBe(true);
    t = observe(t, false, CAMERA_AWAY_MS);
    expect(t).toMatchObject({ present: false, lastSeenAt: 0 });
  });

  it('needs two detections in a row to come back (ignores a single false detection)', () => {
    let t = observe(observe(startTracker(0), true, 0), false, CAMERA_AWAY_MS);
    t = observe(t, true, CAMERA_AWAY_MS + STEP);
    expect(t.present).toBe(false);
    t = observe(t, false, CAMERA_AWAY_MS + 2 * STEP);
    t = observe(t, true, CAMERA_AWAY_MS + 3 * STEP);
    expect(t.present).toBe(false);
    t = observe(t, true, CAMERA_AWAY_MS + 4 * STEP);
    expect(t).toMatchObject({ present: true, lastSeenAt: CAMERA_AWAY_MS + 4 * STEP });
  });

  it('treats the user as present right after turning the camera on', () => {
    expect(startTracker(123)).toEqual({ present: true, lastSeenAt: 123, streak: 0 });
  });
});
