import { useCallback, useEffect, useRef, useState } from 'react';
import { createBackend, type Backend } from './backend';
import { Login } from './components/Login';
import { ProfileEditor } from './components/ProfileEditor';
import { RoomSetup } from './components/RoomSetup';
import { RoomView } from './components/RoomView';
import { Settings } from './components/Settings';
import { Stats } from './components/Stats';
import { TimerBar } from './components/TimerBar';
import { MIN_SESSION_SEC } from './constants';
import { usePresencePublisher } from './hooks/usePresencePublisher';
import { useStudyTimer } from './hooks/useStudyTimer';
import { normalizeRoomCode } from './lib/code';
import { newProfile } from './lib/profile';
import { autoMessageText, toneOf, type AutoKind } from './lib/messages';
import { formatDuration } from './lib/time';
import type { AuthUser, Room, UserProfile } from './types';

const PENDING_JOIN_KEY = 'studyroom:v1:pendingJoin';
const CURRENT_ROOM_KEY = 'studyroom:v1:currentRoom';

// 招待リンク (?join=CODE) で開かれたら、ログイン後に参加できるよう覚えておく
{
  const params = new URLSearchParams(window.location.search);
  const join = params.get('join');
  if (join) {
    sessionStorage.setItem(PENDING_JOIN_KEY, normalizeRoomCode(join));
    params.delete('join');
    const qs = params.toString();
    history.replaceState(null, '', window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash);
  }
}

export function App() {
  const [backend, setBackend] = useState<Backend | null>(null);
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined);
  const [profile, setProfile] = useState<UserProfile | null | undefined>(undefined);

  useEffect(() => {
    createBackend().then(setBackend);
  }, []);

  useEffect(() => {
    if (!backend) return;
    return backend.onAuthChange((u) => {
      setUser(u);
      setProfile(undefined);
    });
  }, [backend]);

  useEffect(() => {
    if (!backend || !user) return;
    let cancelled = false;
    backend.getProfile(user.uid).then((p) => {
      if (!cancelled) setProfile(p);
    });
    return () => {
      cancelled = true;
    };
  }, [backend, user]);

  if (!backend || user === undefined) return <Splash />;
  if (!user) return <Login backend={backend} />;
  if (profile === undefined) return <Splash />;
  if (profile === null) {
    return (
      <div className="center-page">
        <div className="card wide">
          <h2>アバターを選ぼう</h2>
          <p className="hint">髪型と色を選ぶだけ。あとから設定で変えられます。</p>
          <ProfileEditor
            initial={newProfile(user.uid, user.suggestedName ?? '')}
            submitLabel="この見た目ではじめる"
            onSubmit={async (p) => {
              await backend.saveProfile(p);
              setProfile(p);
            }}
          />
        </div>
      </div>
    );
  }
  return <Main backend={backend} profile={profile} setProfile={setProfile} />;
}

function Splash() {
  return (
    <div className="center-page">
      <p className="logo">study room</p>
    </div>
  );
}

type Tab = 'room' | 'stats' | 'settings';

function Main({
  backend,
  profile,
  setProfile,
}: {
  backend: Backend;
  profile: UserProfile;
  setProfile: (p: UserProfile) => void;
}) {
  const [rooms, setRooms] = useState<Room[] | null>(null);
  const [roomId, setRoomId] = useState<string | null>(() => localStorage.getItem(CURRENT_ROOM_KEY));
  const [tab, setTab] = useState<Tab>('room');
  const [addingRoom, setAddingRoom] = useState(false);
  const [toast, setToast] = useState('');
  const [sessionVersion, setSessionVersion] = useState(0);
  const { timer, start, pause, resume, stop, changeCategory } = useStudyTimer(profile.uid);

  useEffect(() => backend.watchMyRooms(profile.uid, setRooms), [backend, profile.uid]);

  // 入っている部屋（同時に入れるのは 1 つ）
  const current = rooms?.find((r) => r.id === roomId) ?? rooms?.[0] ?? null;
  usePresencePublisher(backend, profile, current?.id ?? null, timer);

  /** スタート・休憩・ストップの自動メッセージを、入っている部屋に流す */
  const sendAuto = (kind: AutoKind, category: string, durationSec = 0) => {
    if (!current) return;
    backend
      .sendMessage(current.id, {
        senderId: profile.uid,
        kind,
        text: autoMessageText(toneOf(profile), kind, category, durationSec),
        createdAt: Date.now(),
      })
      .catch((e) => console.warn('message', e));
  };

  const toastTimer = useRef(0);
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(''), 3000);
  }, []);

  const selectRoom = useCallback((id: string) => {
    setRoomId(id);
    localStorage.setItem(CURRENT_ROOM_KEY, id);
  }, []);

  const join = useCallback(
    async (code: string) => {
      const id = normalizeRoomCode(code);
      await backend.joinRoom(profile.uid, id);
      selectRoom(id);
      setAddingRoom(false);
      setTab('room');
    },
    [backend, profile.uid, selectRoom],
  );

  // 招待リンクから来た場合は自動で参加
  useEffect(() => {
    const pending = sessionStorage.getItem(PENDING_JOIN_KEY);
    if (!pending) return;
    sessionStorage.removeItem(PENDING_JOIN_KEY);
    join(pending)
      .then(() => showToast('部屋に参加しました'))
      .catch((e) => showToast(e instanceof Error ? e.message : String(e)));
  }, [join, showToast]);

  const handleStart = (category: string) => {
    start(category);
    sendAuto('auto-start', category);
  };

  const handlePause = () => {
    if (!timer?.segmentStartedAt) return;
    pause();
    sendAuto('auto-break', timer.category);
  };

  const handleStop = async () => {
    const result = stop();
    if (!result) return;
    if (result.durationSec < MIN_SESSION_SEC) {
      showToast('1分未満だったので記録しませんでした');
      return;
    }
    try {
      await backend.addSession(profile.uid, { ...result, source: 'manual' });
      setSessionVersion((v) => v + 1);
      sendAuto('auto-stop', result.category, result.durationSec);
      showToast(`${result.category} ${formatDuration(result.durationSec)} を記録しました`);
    } catch (e) {
      console.error(e);
      showToast('記録の保存に失敗しました');
    }
  };

  const saveProfile = async (p: UserProfile) => {
    await backend.saveProfile(p);
    setProfile(p);
  };

  return (
    <div className="app">
      <header className="app-header">
        <span className="logo small">study room</span>
        {rooms && rooms.length > 0 && (
          <select
            className="room-select"
            value={addingRoom ? '__new' : current?.id}
            onChange={(e) => {
              if (e.target.value === '__new') {
                setAddingRoom(true);
              } else {
                setAddingRoom(false);
                selectRoom(e.target.value);
              }
              setTab('room');
            }}
            aria-label="部屋を選ぶ"
          >
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
            <option value="__new">＋ 部屋をつくる / 参加する</option>
          </select>
        )}
        <nav className="tabs">
          {(
            [
              ['room', '部屋'],
              ['stats', '記録'],
              ['settings', '設定'],
            ] as const
          ).map(([id, label]) => (
            <button key={id} className={`tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </nav>
      </header>

      {backend.kind === 'local' && (
        <div className="mode-banner">ローカルモード：このブラウザの中だけに保存されます（Firebase を設定すると友達と共有できます）</div>
      )}

      <main className="app-main">
        {tab === 'room' &&
          (rooms === null ? (
            <p className="hint center">読み込み中…</p>
          ) : addingRoom || !current ? (
            <RoomSetup
              onCreate={async (name) => {
                const id = await backend.createRoom(profile.uid, name);
                selectRoom(id);
                setAddingRoom(false);
              }}
              onJoin={join}
              onCancel={current ? () => setAddingRoom(false) : undefined}
            />
          ) : (
            <RoomView backend={backend} room={current} profile={profile} />
          ))}
        {tab === 'stats' && <Stats backend={backend} profile={profile} version={sessionVersion} />}
        {tab === 'settings' && (
          <Settings
            backend={backend}
            profile={profile}
            rooms={rooms ?? []}
            onSaveProfile={saveProfile}
            onLeaveRoom={(id) => backend.leaveRoom(profile.uid, id)}
          />
        )}
      </main>

      <footer className="app-footer">
        <TimerBar
          categories={profile.categories}
          timer={timer}
          onStart={handleStart}
          onPause={handlePause}
          onResume={resume}
          onStop={handleStop}
          onChangeCategory={changeCategory}
        />
      </footer>

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
