import { useState } from 'react';
import { HAIR_COLORS, HAIR_STYLES, OUTFIT_COLORS, SKIN_COLORS } from '../constants';
import type { Avatar, UserProfile } from '../types';
import { AvatarPreview } from './AvatarPreview';

interface Props {
  initial: UserProfile;
  submitLabel: string;
  onSubmit: (p: UserProfile) => Promise<void>;
  onCancel?: () => void;
}

function Swatches({ colors, value, onChange, label }: { colors: string[]; value: string; onChange: (c: string) => void; label: string }) {
  return (
    <div className="field">
      <span className="label">{label}</span>
      <div className="swatches" role="radiogroup" aria-label={label}>
        {colors.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={value === c}
            aria-label={c}
            className={`swatch ${value === c ? 'selected' : ''}`}
            style={{ background: c }}
            onClick={() => onChange(c)}
          />
        ))}
      </div>
    </div>
  );
}

/** 名前とアバターの設定（初回は1回だけ。あとから設定画面で変更可能） */
export function ProfileEditor({ initial, submitLabel, onSubmit, onCancel }: Props) {
  const [name, setName] = useState(initial.displayName);
  const [avatar, setAvatar] = useState<Avatar>(initial.avatar);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<Avatar>) => setAvatar((a) => ({ ...a, ...patch }));

  return (
    <form
      className="profile-editor"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!name.trim()) return;
        setBusy(true);
        try {
          await onSubmit({ ...initial, displayName: name.trim(), avatar });
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="profile-grid">
        <AvatarPreview avatar={avatar} name={name} />
        <div className="stack">
          <div className="field">
            <span className="label">名前</span>
            <input className="input" value={name} maxLength={20} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="field">
            <span className="label">髪型</span>
            <div className="chips">
              {HAIR_STYLES.map((h) => (
                <button
                  key={h.id}
                  type="button"
                  className={`chip ${avatar.hair === h.id ? 'selected' : ''}`}
                  onClick={() => set({ hair: h.id })}
                >
                  {h.label}
                </button>
              ))}
            </div>
          </div>
          <Swatches label="髪の色" colors={HAIR_COLORS} value={avatar.hairColor} onChange={(c) => set({ hairColor: c })} />
          <Swatches label="服の色" colors={OUTFIT_COLORS} value={avatar.outfitColor} onChange={(c) => set({ outfitColor: c })} />
          <Swatches label="肌の色" colors={SKIN_COLORS} value={avatar.skin} onChange={(c) => set({ skin: c })} />
        </div>
      </div>
      <div className="row end">
        {onCancel && (
          <button type="button" className="btn" onClick={onCancel}>
            キャンセル
          </button>
        )}
        <button className="btn primary" disabled={busy || !name.trim()}>
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
