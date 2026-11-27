import { useEffect, useRef, useState } from 'react';
import type { CameraStatus } from '../hooks/useCameraPresence';
import { POMODORO_PRESETS, type PomodoroPresetId } from '../constants';
import { categoryColor } from '../lib/color';
import { isLongBreak, pomodoroRemainingMs, presetOf } from '../lib/pomodoro';
import { formatClock } from '../lib/time';
import { elapsedSec, useNow, type ActiveTimer } from '../hooks/useStudyTimer';

interface Props {
  categories: string[];
  timer: ActiveTimer | null;
  onStart: (category: string, pomodoro?: PomodoroPresetId) => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onChangeCategory: (category: string) => void;
  camera: CameraProps;
}

interface CameraProps {
  enabled: boolean;
  status: CameraStatus;
  present: boolean;
  stream: MediaStream | null;
  onToggle: (on: boolean) => void;
}

/** カメラの在席判定のスイッチと小さなプレビュー（映像は画面に映すだけで送信しない） */
function CameraToggle({ camera }: { camera: CameraProps }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = camera.stream;
  }, [camera.stream]);
  const label =
    camera.status === 'starting' ? '準備中…' : camera.status === 'on' ? (camera.present ? '在席' : '顔が見えません') : 'カメラ';
  return (
    <button
      type="button"
      className={`camera-toggle ${camera.enabled ? 'on' : ''} ${camera.status === 'on' && !camera.present ? 'absent' : ''}`}
      aria-pressed={camera.enabled}
      title="カメラは在席判定にだけ使い、映像は送信しません"
      onClick={() => camera.onToggle(!camera.enabled)}
    >
      {camera.stream ? <video ref={videoRef} className="camera-preview" muted playsInline autoPlay /> : <span aria-hidden>📷</span>}
      <span className="camera-label">
        {label}
        {camera.enabled && <small>映像は送信しません</small>}
      </span>
    </button>
  );
}

const LAST_CATEGORY_KEY = 'studyroom:v1:lastCategory';
const LAST_MODE_KEY = 'studyroom:v1:lastTimerMode';
type Mode = 'normal' | PomodoroPresetId;

/** 残り時間 12:34 */
function mmss(ms: number) {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
const FORGOT_STOP_SEC = 6 * 60 * 60;

/** 分野を選んでスタート / 休憩 / ストップ */
export function TimerBar({ categories, timer, onStart, onPause, onResume, onStop, onChangeCategory, camera }: Props) {
  const now = useNow(1000, !!timer);
  const [category, setCategory] = useState(() => {
    const last = localStorage.getItem(LAST_CATEGORY_KEY);
    return last && categories.includes(last) ? last : categories[0] ?? '';
  });

  const [mode, setMode] = useState<Mode>(() => {
    const last = localStorage.getItem(LAST_MODE_KEY);
    return POMODORO_PRESETS.some((p) => p.id === last) ? (last as PomodoroPresetId) : 'normal';
  });

  useEffect(() => {
    if (!categories.includes(category)) setCategory(categories[0] ?? '');
  }, [categories, category]);

  const elapsed = timer ? elapsedSec(timer, now) : 0;
  const running = !!timer?.segmentStartedAt;
  const pomo = timer?.pomodoro;
  const remaining = pomo ? mmss(pomodoroRemainingMs(pomo, now)) : '';
  const pomoState = !pomo
    ? ''
    : pomo.phase === 'break'
      ? isLongBreak(pomo.preset, pomo.round)
        ? '長い休憩'
        : '休憩'
      : pomo.phaseEndsAt === null
        ? '一時停止'
        : `集中 ${pomo.round}回目`;

  useEffect(() => {
    if (!timer) {
      document.title = 'study room';
      return;
    }
    // ポモドーロは区間の残り時間を、ふつうは勉強時間の合計をタブに出す
    document.title = pomo
      ? `🍅 ${remaining} ${pomoState} ${timer.category} | study room`
      : `${running ? '●' : '☕'} ${formatClock(elapsed)} ${timer.category} | study room`;
  }, [timer, elapsed, running, pomo, remaining, pomoState]);

  if (!timer) {
    return (
      <div className="timer-bar">
        <div className="category-picker" role="radiogroup" aria-label="分野">
          {categories.map((c) => (
            <button
              key={c}
              role="radio"
              aria-checked={category === c}
              className={`chip ${category === c ? 'selected' : ''}`}
              style={category === c ? { background: categoryColor(c), borderColor: categoryColor(c) } : undefined}
              onClick={() => setCategory(c)}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="timer-mode" role="radiogroup" aria-label="タイマーの種類">
          {([['normal', 'ふつう'], ...POMODORO_PRESETS.map((p) => [p.id, `🍅 ${p.label}`])] as [Mode, string][]).map(([id, label]) => (
            <button
              key={id}
              role="radio"
              aria-checked={mode === id}
              className={`mode ${mode === id ? 'selected' : ''}`}
              onClick={() => {
                setMode(id);
                localStorage.setItem(LAST_MODE_KEY, id);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <CameraToggle camera={camera} />
        <button
          className="btn primary big"
          disabled={!category}
          onClick={() => {
            localStorage.setItem(LAST_CATEGORY_KEY, category);
            onStart(category, mode === 'normal' ? undefined : mode);
          }}
        >
          ▶ スタート
        </button>
      </div>
    );
  }

  return (
    <div className={`timer-bar active ${running ? 'running' : 'paused'}`}>
      <div className="timer-info">
        <select
          className="category-select"
          value={timer.category}
          style={{ background: categoryColor(timer.category) }}
          onChange={(e) => onChangeCategory(e.target.value)}
          aria-label="分野を変更"
        >
          {[...new Set([timer.category, ...categories])].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <span className="clock" aria-live="off">
          {formatClock(elapsed)}
        </span>
        {timer.pausedBy === 'camera' ? (
          <span className="state away">離席中（カメラ）・戻ると再開</span>
        ) : pomo ? (
          <span className={`pomo ${pomo.phase}`}>
            <span className="pomo-dots" aria-label={`${presetOf(pomo.preset).every}回のうち${((pomo.round - 1) % presetOf(pomo.preset).every) + 1}回目`}>
              {Array.from({ length: presetOf(pomo.preset).every }, (_, i) => (
                <i key={i} className={i < ((pomo.round - 1) % presetOf(pomo.preset).every) + (pomo.phase === 'break' ? 1 : 0) ? 'done' : i === (pomo.round - 1) % presetOf(pomo.preset).every ? 'now' : ''} />
              ))}
            </span>
            {pomoState}・残り <b>{remaining}</b>
          </span>
        ) : (
          <span className="state">{running ? '勉強中' : '休憩中'}</span>
        )}
      </div>
      {elapsed > FORGOT_STOP_SEC && <p className="warn">ストップし忘れていませんか？</p>}
      <div className="row">
        <CameraToggle camera={camera} />
        {running ? (
          <button className="btn" onClick={onPause}>
            ☕ 休憩
          </button>
        ) : (
          <button className="btn primary" onClick={onResume}>
            {pomo?.phase === 'break' ? '▶ 休憩を切り上げる' : '▶ 再開'}
          </button>
        )}
        <button className="btn danger" onClick={onStop}>
          ■ ストップして記録
        </button>
      </div>
    </div>
  );
}
