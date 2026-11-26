import { useState } from 'react';
import type { Backend } from '../backend';
import { DEFAULT_CATEGORIES } from '../constants';
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
            await onSaveProfile(p);
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
        <h3>参加している部屋</h3>
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
