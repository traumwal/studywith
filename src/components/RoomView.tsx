import { useEffect, useMemo, useRef, useState } from 'react';
import type { Backend } from '../backend';
import { LOG_LIMIT, MESSAGE_LOOKBACK_MS, STAMP_COOLDOWN_MS } from '../constants';
import { inviteUrl } from '../lib/code';
import { mergeMessages, stampsOf } from '../lib/messages';
import { formatDuration } from '../lib/time';
import { canvasMeasure, CommentScheduler } from '../room/comments';
import { deskSetOf, effectiveStatus, studiedSec } from '../room/draw';
import { RoomCanvas } from '../room/RoomCanvas';
import { useNow } from '../hooks/useStudyTimer';
import type { Presence, Room, RoomMessage, UserProfile } from '../types';

const STATUS_LABEL = { studying: '勉強中', break: '休憩中', away: '離席中', offline: 'オフライン' } as const;
const UNKNOWN_COLOR = '#9aa3b4';

export function RoomView({ backend, room, profile }: { backend: Backend; room: Room; profile: UserProfile }) {
  const myUid = profile.uid;
  const [presence, setPresence] = useState<Presence[]>([]);
  const [copied, setCopied] = useState(false);
  const now = useNow(30 * 1000);

  useEffect(() => backend.watchPresence(room.id, setPresence), [backend, room.id]);

  const seats = useMemo(() => {
    const map = new Map(presence.map((p) => [p.uid, p]));
    return room.memberIds.map((uid) => ({ uid, presence: map.get(uid), isMe: uid === myUid }));
  }, [presence, room.memberIds, myUid]);

  /** 送った人の名前と、吹き出しの四角の色（椅子の色） */
  const who = (uid: string) => {
    const p = presence.find((x) => x.uid === uid);
    if (uid === myUid) return { name: profile.displayName, color: deskSetOf(profile.avatar).chair };
    return p ? { name: p.displayName, color: deskSetOf(p.avatar).chair } : { name: '退出したメンバー', color: UNKNOWN_COLOR };
  };
  const whoRef = useRef(who);
  whoRef.current = who;

  // ───── 流れるコメント ─────
  // 部屋を開いている間に届いたものだけ流す（タブが隠れている間のものは流さず LOG にだけ残す）
  const scheduler = useMemo(() => new CommentScheduler(canvasMeasure), [room.id]);
  const [live, setLive] = useState<RoomMessage[]>([]);
  useEffect(() => {
    setLive([]);
    const seen = new Set<string>();
    const since = Date.now() - MESSAGE_LOOKBACK_MS;
    return backend.watchMessages(room.id, since, (list) => {
      const fresh = list.filter((m) => !seen.has(m.id));
      if (!fresh.length) return;
      fresh.forEach((m) => {
        seen.add(m.id);
        if (document.visibilityState !== 'visible') return;
        scheduler.push({ id: m.id, text: m.text, color: whoRef.current(m.senderId).color, auto: m.kind !== 'stamp' });
      });
      setLive((prev) => mergeMessages(prev, fresh, LOG_LIMIT));
    });
  }, [backend, room.id, scheduler]);

  // ───── スタンプ ─────
  const [cooling, setCooling] = useState(false);
  const sendStamp = async (text: string) => {
    if (cooling) return;
    setCooling(true);
    setTimeout(() => setCooling(false), STAMP_COOLDOWN_MS);
    try {
      await backend.sendMessage(room.id, { senderId: myUid, kind: 'stamp', text, createdAt: Date.now() });
    } catch (e) {
      console.warn('stamp', e);
    }
  };

  // ───── LOG ─────
  const [logOpen, setLogOpen] = useState(false);
  const [history, setHistory] = useState<RoomMessage[]>([]);
  useEffect(() => {
    setLogOpen(false);
    setHistory([]);
  }, [room.id]);
  useEffect(() => {
    if (!logOpen) return;
    let cancelled = false;
    backend.listMessages(room.id, LOG_LIMIT).then((list) => {
      if (!cancelled) setHistory(list);
    });
    return () => {
      cancelled = true;
    };
  }, [backend, room.id, logOpen]);
  const log = mergeMessages(history, live, LOG_LIMIT);

  const studyingCount = seats.filter((s) => effectiveStatus(s.presence, now) === 'studying').length;

  return (
    <div className="room-view">
      <div className="room-header">
        <h2>{room.name}</h2>
        <span className="hint">
          {studyingCount > 0 ? `${studyingCount}人が勉強中` : 'いまは誰も勉強していません'}
        </span>
      </div>
      <RoomCanvas seats={seats} comments={scheduler} />

      <div className="stamp-bar">
        <div className="stamps" role="group" aria-label="スタンプ">
          {stampsOf(profile).map((s) => (
            <button key={s} className="chip stamp" disabled={cooling} onClick={() => sendStamp(s)}>
              {s}
            </button>
          ))}
        </div>
        <button className={`btn small log-toggle ${logOpen ? 'active' : ''}`} aria-expanded={logOpen} onClick={() => setLogOpen((v) => !v)}>
          LOG
        </button>
      </div>

      {logOpen && (
        <section className="log card" aria-label="LOG">
          {log.length === 0 ? (
            <p className="hint center">まだ何も流れていません</p>
          ) : (
            <ol className="log-list">
              {log.map((m) => {
                const w = who(m.senderId);
                return (
                  <li key={m.id} className={m.kind === 'stamp' ? 'stamp' : 'auto'}>
                    <time dateTime={new Date(m.createdAt).toISOString()}>{logTime(m.createdAt, now)}</time>
                    <i className="log-dot" style={{ background: w.color }} />
                    <span className="log-name">{w.name}</span>
                    <span className="log-text">{m.text}</span>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      )}

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

/** 今日なら 21:05、それ以外は 11/26 21:05 */
function logTime(ms: number, now: number) {
  const d = new Date(ms);
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return d.toDateString() === new Date(now).toDateString() ? hm : `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
}
