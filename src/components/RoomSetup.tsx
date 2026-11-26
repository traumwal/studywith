import { useState } from 'react';

interface Props {
  onCreate: (name: string) => Promise<void>;
  onJoin: (code: string) => Promise<void>;
  onCancel?: () => void;
}

export function RoomSetup({ onCreate, onJoin, onCancel }: Props) {
  const [roomName, setRoomName] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="room-setup">
      <div className="card">
        <h2>部屋をつくる</h2>
        <p className="hint">つくったら招待リンクを友達に送ってください。</p>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => onCreate(roomName.trim() || 'みんなの勉強部屋'));
          }}
        >
          <input
            className="input"
            placeholder="部屋の名前（例：いつもの部屋）"
            value={roomName}
            maxLength={30}
            onChange={(e) => setRoomName(e.target.value)}
          />
          <button className="btn primary" disabled={busy}>
            つくる
          </button>
        </form>
      </div>
      <div className="card">
        <h2>招待コードで参加</h2>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.trim()) run(() => onJoin(code));
          }}
        >
          <input
            className="input code-input"
            placeholder="ABC234"
            value={code}
            maxLength={12}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
          <button className="btn primary" disabled={busy || !code.trim()}>
            参加する
          </button>
        </form>
      </div>
      {error && <p className="error">{error}</p>}
      {onCancel && (
        <button className="btn ghost" onClick={onCancel}>
          戻る
        </button>
      )}
    </div>
  );
}
