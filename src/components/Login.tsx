import { useState } from 'react';
import type { Backend } from '../backend';

export function Login({ backend }: { backend: Backend }) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const accounts = backend.listLocalAccounts?.() ?? [];

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
    <div className="center-page">
      <div className="card login-card">
        <h1 className="logo">study room</h1>
        <p className="lead">友達と「同じ部屋」で、ゆるく一緒に勉強しよう。</p>

        {backend.kind === 'firebase' ? (
          <div className="stack">
            <button className="btn primary" disabled={busy} onClick={() => run(() => backend.signIn('google'))}>
              Google でログイン
            </button>
            <button className="btn" disabled={busy} onClick={() => run(() => backend.signIn('guest'))}>
              ゲストで始める
            </button>
            <p className="hint">ゲストの記録はこのブラウザにだけ紐づきます。別の端末でも使うなら Google でログインしてください。</p>
          </div>
        ) : (
          <div className="stack">
            <div className="notice">
              ローカルモードで動いています（Firebase 未設定）。データはこのブラウザの中だけに保存されます。
              別のタブで別の名前を使って入ると、1台で「友達のいる部屋」を試せます。
            </div>
            {accounts.length > 0 && (
              <div className="stack">
                <span className="label">このブラウザの利用者</span>
                <div className="chips">
                  {accounts.map((a) => (
                    <button
                      key={a.uid}
                      className="chip"
                      disabled={busy}
                      onClick={() => run(() => backend.signIn('local', { uid: a.uid }))}
                    >
                      {a.displayName}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <form
              className="row"
              onSubmit={(e) => {
                e.preventDefault();
                if (name.trim()) run(() => backend.signIn('local', { displayName: name }));
              }}
            >
              <input
                className="input"
                placeholder="新しく名前を入力"
                value={name}
                maxLength={20}
                onChange={(e) => setName(e.target.value)}
              />
              <button className="btn primary" disabled={busy || !name.trim()}>
                はじめる
              </button>
            </form>
          </div>
        )}
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}
