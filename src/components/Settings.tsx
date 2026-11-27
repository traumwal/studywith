import { useState } from 'react';
import type { Backend } from '../backend';
import { DEFAULT_CATEGORIES, DEFAULT_STAMPS, MAX_MESSAGE_LEN, MAX_STAMPS, TONES } from '../constants';
import { autoMessageText, clampText, stampsOf, toneOf } from '../lib/messages';
import type { Room, UserProfile } from '../types';
import { ProfileEditor } from './ProfileEditor';

interface Props {
  backend: Backend;
  profile: UserProfile;
  rooms: Room[];
  onSaveProfile: (p: UserProfile) => Promise<void>;
  onLeaveRoom: (roomId: string) => Promise<void>;
}

export function Settings({ backend, profile, rooms, onSaveProfile, onLeaveRoom }: Props) {
  const [newCat, setNewCat] = useState('');
  const [newStamp, setNewStamp] = useState('');
  const stamps = stampsOf(profile);
  const tone = toneOf(profile);
  const saveStamps = (next: string[]) => onSaveProfile({ ...profile, stamps: next });
  const moveStamp = (i: number, d: -1 | 1) => {
    const next = [...stamps];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    saveStamps(next);
  };
  const [saved, setSaved] = useState(false);

  const saveCategories = (categories: string[]) => onSaveProfile({ ...profile, categories });

  return (
    <div className="settings">
      <section className="card">
        <h3>名前とアバター</h3>
        <ProfileEditor
          key={JSON.stringify(profile.avatar) + profile.displayName}
          initial={profile}
          submitLabel={saved ? '保存しました' : '保存'}
          onSubmit={async (p) => {
            // 名前とアバターだけを反映する（開いた後に変えた分野・スタンプ・口調を古い値で上書きしない）
            await onSaveProfile({ ...profile, displayName: p.displayName, avatar: p.avatar });
            setSaved(true);
            setTimeout(() => setSaved(false), 1500);
          }}
        />
      </section>

      <section className="card">
        <h3>分野</h3>
        <div className="chips">
          {profile.categories.map((c) => (
            <span key={c} className="chip removable">
              {c}
              <button
                aria-label={`${c} を削除`}
                onClick={() => saveCategories(profile.categories.filter((x) => x !== c))}
                disabled={profile.categories.length <= 1}
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            const name = newCat.trim();
            if (!name || profile.categories.includes(name)) return;
            saveCategories([...profile.categories, name]);
            setNewCat('');
          }}
        >
          <input
            className="input"
            placeholder="分野を追加（例：数学）"
            value={newCat}
            maxLength={16}
            onChange={(e) => setNewCat(e.target.value)}
          />
          <button className="btn" disabled={!newCat.trim()}>
            追加
          </button>
        </form>
        <button className="btn ghost small" onClick={() => saveCategories([...DEFAULT_CATEGORIES])}>
          初期の分野に戻す
        </button>
      </section>

      <section className="card">
        <h3>スタンプ（マイセット）</h3>
        <p className="hint">部屋の下に並ぶ定型文です。押すと部屋の空を流れます（最大{MAX_STAMPS}個）。</p>
        <ol className="stamp-editor">
          {stamps.map((st, i) => (
            <li key={st} className="chip removable">
              <button aria-label={`${st} を前へ`} disabled={i === 0} onClick={() => moveStamp(i, -1)}>
                ‹
              </button>
              <span>{st}</span>
              <button aria-label={`${st} を後ろへ`} disabled={i === stamps.length - 1} onClick={() => moveStamp(i, 1)}>
                ›
              </button>
              <button aria-label={`${st} を削除`} disabled={stamps.length <= 1} onClick={() => saveStamps(stamps.filter((x) => x !== st))}>
                ×
              </button>
            </li>
          ))}
        </ol>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            const text = clampText(newStamp);
            if (!text || stamps.includes(text) || stamps.length >= MAX_STAMPS) return;
            saveStamps([...stamps, text]);
            setNewStamp('');
          }}
        >
          <input
            className="input"
            placeholder={stamps.length >= MAX_STAMPS ? `${MAX_STAMPS}個までです` : 'スタンプを追加（例：ナイス）'}
            value={newStamp}
            maxLength={MAX_MESSAGE_LEN}
            disabled={stamps.length >= MAX_STAMPS}
            onChange={(e) => setNewStamp(e.target.value)}
          />
          <button className="btn" disabled={!newStamp.trim() || stamps.length >= MAX_STAMPS}>
            追加
          </button>
        </form>
        <button className="btn ghost small" onClick={() => saveStamps([...DEFAULT_STAMPS])}>
          初期のスタンプに戻す
        </button>
      </section>

      <section className="card">
        <h3>自動メッセージの口調</h3>
        <p className="hint">スタート・休憩・ストップのときに自動で流れる文章です。文章は固定で、口調だけ選べます。</p>
        <div className="tone-list" role="radiogroup" aria-label="自動メッセージの口調">
          {TONES.map((t) => (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={tone === t.id}
              className={`tone ${tone === t.id ? 'selected' : ''}`}
              onClick={() => onSaveProfile({ ...profile, tone: t.id })}
            >
              <strong>{t.label}</strong>
              <span>{autoMessageText(t.id, 'auto-start', '英語')}</span>
              <span>{autoMessageText(t.id, 'auto-break', '英語')}</span>
              <span>{autoMessageText(t.id, 'auto-stop', '英語', 50 * 60)}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="card">
        <h3>参加している部屋</h3>
        <p className="hint">同時に入れる部屋は 1 つです。画面上の選択で切り替えると、前の部屋ではオフラインになります。</p>
        <ul className="room-list">
          {rooms.map((r) => (
            <li key={r.id}>
              <span>
                {r.name} <code>{r.id}</code>（{r.memberIds.length}人）
              </span>
              <button
                className="btn small danger"
                onClick={() => {
                  if (confirm(`「${r.name}」から退出しますか？`)) onLeaveRoom(r.id);
                }}
              >
                退出
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h3>アカウント</h3>
        <p className="hint">
          {backend.kind === 'local'
            ? 'ローカルモード：データはこのブラウザの中だけに保存されています。'
            : 'Firebase に保存されています。'}
        </p>
        <button className="btn" onClick={() => backend.signOut()}>
          ログアウト
        </button>
      </section>
    </div>
  );
}
