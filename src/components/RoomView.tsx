import { useEffect, useMemo, useState } from 'react';
import type { Backend } from '../backend';
import { inviteUrl } from '../lib/code';
import { formatDuration } from '../lib/time';
import { effectiveStatus, studiedSec } from '../room/draw';
import { RoomCanvas } from '../room/RoomCanvas';
import { useNow } from '../hooks/useStudyTimer';
import type { Presence, Room } from '../types';

const STATUS_LABEL = { studying: '勉強中', break: '休憩中', away: '離席中', offline: 'オフライン' } as const;

export function RoomView({ backend, room, myUid }: { backend: Backend; room: Room; myUid: string }) {
  const [presence, setPresence] = useState<Presence[]>([]);
  const [copied, setCopied] = useState(false);
  const now = useNow(30 * 1000);

  useEffect(() => backend.watchPresence(room.id, setPresence), [backend, room.id]);

  const seats = useMemo(() => {
    const map = new Map(presence.map((p) => [p.uid, p]));
    return room.memberIds.map((uid) => ({ uid, presence: map.get(uid), isMe: uid === myUid }));
  }, [presence, room.memberIds, myUid]);

  const studyingCount = seats.filter((s) => effectiveStatus(s.presence, now) === 'studying').length;

  return (
    <div className="room-view">
      <div className="room-header">
        <h2>{room.name}</h2>
        <span className="hint">
          {studyingCount > 0 ? `${studyingCount}人が勉強中` : 'いまは誰も勉強していません'}
        </span>
      </div>
      <RoomCanvas seats={seats} />

      <ul className="member-list" aria-label="メンバーの状態">
        {seats.map((s) => {
          const status = effectiveStatus(s.presence, now);
          return (
            <li key={s.uid} className={`member ${status}`}>
              <i className="status-dot" />
              <span className="member-name">
                {s.presence?.displayName ?? '（未入室）'}
                {s.isMe && '（あなた）'}
              </span>
              <span className="member-status">
                {STATUS_LABEL[status]}
                {s.presence && (status === 'studying' || status === 'break') &&
                  ` · ${s.presence.category} ${formatDuration(studiedSec(s.presence, now))}`}
              </span>
            </li>
          );
        })}
      </ul>

      {room.memberIds.length < 2 && <p className="hint center">まだ1人です。下の招待リンクを友達に送ってみましょう。</p>}
      <div className="invite card">
        <div>
          <span className="label">招待コード</span>
          <code className="invite-code">{room.id}</code>
        </div>
        <button
          className="btn"
          onClick={async () => {
            const url = inviteUrl(room.id);
            try {
              await navigator.clipboard.writeText(url);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              prompt('このリンクをコピーして友達に送ってください', url);
            }
          }}
        >
          {copied ? 'コピーしました' : '招待リンクをコピー'}
        </button>
      </div>
    </div>
  );
}
