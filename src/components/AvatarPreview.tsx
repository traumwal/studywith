import { useEffect, useRef } from 'react';
import { drawPreviewBackdrop, drawSeat, drawSeatLabels, type Seat } from '../room/draw';
import type { Avatar, PresenceStatus } from '../types';

const W = 64;
const H = 72;
const DESK_Y = 46;

/** 設定画面用の小さなプレビュー（勉強中 → 休憩中 を交互に見せる） */
export function AvatarPreview({ avatar, name }: { avatar: Avatar; name: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const latest = useRef({ avatar, name });
  latest.current = { avatar, name };

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    const scale = 3 * Math.max(1, Math.round(window.devicePixelRatio || 1));
    canvas.width = W * scale;
    canvas.height = H * scale;
    const t0 = performance.now();
    const id = setInterval(() => {
      const t = performance.now() - t0;
      const now = Date.now();
      const status: PresenceStatus = Math.floor(t / 6000) % 2 === 0 ? 'studying' : 'break';
      const seat: Seat = {
        uid: 'preview',
        isMe: true,
        presence: {
          uid: 'preview',
          displayName: latest.current.name || 'あなた',
          avatar: latest.current.avatar,
          status,
          category: 'プレビュー',
          startedAt: now - 25 * 60 * 1000,
          accumulatedSec: 0,
          updatedAt: now,
        },
      };
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.imageSmoothingEnabled = false;
      drawPreviewBackdrop(ctx, W, H, DESK_Y - 6);
      drawSeat(ctx, W / 2, DESK_Y, seat, now, t);
      drawSeatLabels(ctx, W / 2, DESK_Y, seat, now, t);
    }, 1000 / 12);
    return () => clearInterval(id);
  }, []);

  return <canvas ref={ref} className="avatar-preview" style={{ width: W * 3, height: H * 3 }} />;
}
