import { useEffect, useRef } from 'react';
import { drawSeat } from '../room/draw';
import type { Avatar, PresenceStatus } from '../types';

const W = 64;
const H = 72;

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
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.fillStyle = '#efe3cc';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#c09163';
      ctx.fillRect(0, 44, W, H - 44);
      drawSeat(
        ctx,
        W / 2,
        48,
        {
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
        },
        now,
        t,
      );
    }, 1000 / 12);
    return () => clearInterval(id);
  }, []);

  return <canvas ref={ref} className="avatar-preview" style={{ width: W * 3, height: H * 3 }} />;
}
