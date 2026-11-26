import { useEffect, useRef, useState } from 'react';
import { drawNightTint, drawRoom, drawSeat, roomSize, seatPosition, type Seat } from './draw';

const FPS = 12;

interface Props {
  seats: Seat[];
}

/**
 * 部屋の描画。12fps で描き、タブが見えていないときは止める（仕様 7. パフォーマンス）。
 */
export function RoomCanvas({ seats }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const seatsRef = useRef(seats);
  seatsRef.current = seats;
  const [containerW, setContainerW] = useState(0);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setContainerW(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || containerW === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let timer = 0;
    let stopped = false;
    const t0 = performance.now();

    const render = () => {
      const list = seatsRef.current;
      const maxCols = containerW < 480 ? 2 : 4;
      const { cols, width, height } = roomSize(list.length, maxCols);
      const dpr = window.devicePixelRatio || 1;
      // にじまないよう、実ピクセルで整数倍に拡大する
      const scale = Math.max(1, Math.floor((containerW * dpr) / width));
      if (canvas.width !== width * scale || canvas.height !== height * scale) {
        canvas.width = width * scale;
        canvas.height = height * scale;
        canvas.style.width = `${(width * scale) / dpr}px`;
        canvas.style.height = `${(height * scale) / dpr}px`;
      }
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.imageSmoothingEnabled = false;

      const nowMs = Date.now();
      const now = new Date(nowMs);
      const t = performance.now() - t0;
      drawRoom(ctx, width, height, now, t);
      drawNightTint(ctx, width, height, now);
      list.forEach((seat, i) => {
        const { cx, deskY } = seatPosition(i, cols, list.length, width);
        drawSeat(ctx, cx, deskY, seat, nowMs, t);
      });
    };

    const loop = () => {
      if (stopped) return;
      if (document.visibilityState === 'visible') render();
      timer = window.setTimeout(loop, 1000 / FPS);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') render();
    };
    document.addEventListener('visibilitychange', onVisibility);
    loop();
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [containerW]);

  return (
    <div ref={wrapRef} className="room-canvas-wrap">
      <canvas ref={canvasRef} className="room-canvas" role="img" aria-label="勉強部屋" />
    </div>
  );
}
