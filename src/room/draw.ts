import { PRESENCE_STALE_MS } from '../constants';
import { categoryColor } from '../lib/color';
import type { Avatar, Presence, PresenceStatus } from '../types';

/**
 * 2D 勉強部屋の描画。すべて「論理ピクセル」で描き、呼び出し側で整数倍に拡大する。
 * 画像素材は使わず fillRect でドット絵を組み立てているので、
 * あとで自作のスプライトに差し替える場合はこのファイルだけを書き換えればよい。
 */

export const COL_W = 64;
const PAD_X = 16;
const WALL_H = 60;
const FIRST_DESK_Y = 98;
const ROW_H = 68;

export interface Seat {
  uid: string;
  presence: Presence | undefined;
  isMe: boolean;
}

export function roomSize(seatCount: number, maxCols: number) {
  const cols = Math.max(2, Math.min(maxCols, seatCount));
  const rows = Math.max(1, Math.ceil(seatCount / cols));
  return {
    cols,
    rows,
    width: PAD_X * 2 + cols * COL_W,
    height: FIRST_DESK_Y + (rows - 1) * ROW_H + 26,
  };
}

/** presence の更新が古ければオフラインとみなす */
export function effectiveStatus(p: Presence | undefined, now: number): PresenceStatus {
  if (!p) return 'offline';
  if (now - p.updatedAt > PRESENCE_STALE_MS) return 'offline';
  return p.status;
}

export function studiedSec(p: Presence, now: number): number {
  const running = p.status === 'studying' && p.startedAt ? (now - p.startedAt) / 1000 : 0;
  return p.accumulatedSec + Math.max(0, running);
}

/** 頭上の表示用。例: 45分 / 1時間20分 */
function shortDuration(sec: number): string {
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}分`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}時間${m}分` : `${h}時間`;
}

type Ctx = CanvasRenderingContext2D;

function rect(ctx: Ctx, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
}

function px(ctx: Ctx, x: number, y: number, color: string) {
  rect(ctx, x, y, 1, 1, color);
}

function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v + amount * 255)));
  const r = f((n >> 16) & 255);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `rgb(${r},${g},${b})`;
}

const FONT = '"Hiragino Kaku Gothic ProN", "Noto Sans JP", "Meiryo", sans-serif';

function fitText(ctx: Ctx, text: string, size: number, maxW: number, weight = 'bold') {
  ctx.font = `${weight} ${size}px ${FONT}`;
  const w = ctx.measureText(text).width;
  if (w > maxW) {
    size = Math.max(3, (size * maxW) / w);
    ctx.font = `${weight} ${size}px ${FONT}`;
  }
  return { width: Math.min(w, maxW), size };
}

// ───────────────────────── 部屋 ─────────────────────────

type DayPhase = 'day' | 'evening' | 'night';

export function dayPhase(date: Date): DayPhase {
  const h = date.getHours();
  if (h >= 6 && h < 16) return 'day';
  if (h >= 16 && h < 19) return 'evening';
  return 'night';
}

function drawWindow(ctx: Ctx, x: number, y: number, w: number, h: number, phase: DayPhase, t: number) {
  const frame = '#7a5a3c';
  rect(ctx, x - 2, y - 2, w + 4, h + 4, frame);
  if (phase === 'day') {
    rect(ctx, x, y, w, h, '#9fd3f2');
    rect(ctx, x, y + h - 8, w, 8, '#c4e6f7');
    // ゆっくり流れる雲
    const cx = x + ((t / 400) % (w + 20)) - 14;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    rect(ctx, cx, y + 8, 12, 3, '#ffffff');
    rect(ctx, cx + 3, y + 6, 6, 2, '#ffffff');
    rect(ctx, cx + 22, y + 18, 8, 2, '#ffffff');
    ctx.restore();
    rect(ctx, x + w - 10, y + 4, 5, 5, '#ffe9a3');
  } else if (phase === 'evening') {
    rect(ctx, x, y, w, h, '#f4a26b');
    rect(ctx, x, y, w, 10, '#c9739a');
    rect(ctx, x, y + h - 10, w, 10, '#f7c27f');
    rect(ctx, x + 8, y + h - 9, 7, 5, '#ffdf8a');
  } else {
    rect(ctx, x, y, w, h, '#1f2a4d');
    rect(ctx, x, y + h - 8, w, 8, '#2a3866');
    const stars = [
      [6, 5], [18, 12], [30, 4], [44, 9], [12, 20], [38, 22], [50, 16],
    ];
    stars.forEach(([sx, sy], i) => {
      if (sx < w && sy < h && (Math.floor(t / 900) + i) % 5 !== 0) px(ctx, x + sx, y + sy, '#fff6c8');
    });
    // 三日月
    rect(ctx, x + w - 13, y + 4, 4, 6, '#f5f0d0');
    rect(ctx, x + w - 12, y + 3, 2, 8, '#f5f0d0');
    rect(ctx, x + w - 11, y + 4, 3, 5, '#1f2a4d');
  }
  // 窓枠の十字
  rect(ctx, x + w / 2 - 1, y, 2, h, frame);
  rect(ctx, x, y + h / 2 - 1, w, 2, frame);
  // 窓台
  rect(ctx, x - 4, y + h + 2, w + 8, 2, '#8c6a4a');
}

function drawClock(ctx: Ctx, cx: number, cy: number, date: Date) {
  const r = 6;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const d = dx * dx + dy * dy;
      if (d <= r * r) px(ctx, cx + dx, cy + dy, d > (r - 1.2) * (r - 1.2) ? '#5b4636' : '#fbf7ee');
    }
  }
  const hand = (angle: number, len: number, color: string) => {
    for (let i = 0; i <= len; i += 0.5) {
      px(ctx, cx + Math.round(Math.sin(angle) * i), cy - Math.round(Math.cos(angle) * i), color);
    }
  };
  const m = date.getMinutes();
  const h = (date.getHours() % 12) + m / 60;
  hand((h / 12) * Math.PI * 2, 3, '#3a2a20');
  hand((m / 60) * Math.PI * 2, 4.5, '#3a2a20');
  px(ctx, cx, cy, '#c0392b');
}

function drawShelf(ctx: Ctx, x: number, y: number) {
  rect(ctx, x, y + 12, 30, 2, '#7a5a3c');
  const books = ['#c0504d', '#4f81bd', '#9bbb59', '#f2cc5b', '#8064a2', '#4bacc6'];
  let bx = x + 2;
  books.forEach((c, i) => {
    const h = 9 + (i % 3);
    rect(ctx, bx, y + 12 - h, 3 + (i % 2), h, c);
    bx += 4 + (i % 2);
  });
}

function drawPlant(ctx: Ctx, x: number, floorY: number, t: number) {
  const sway = Math.floor(t / 1500) % 2;
  rect(ctx, x, floorY - 8, 10, 8, '#b5643c');
  rect(ctx, x - 1, floorY - 9, 12, 2, '#9a5232');
  const leaf = '#4f9a52';
  const leafD = '#3c7a40';
  rect(ctx, x + 4, floorY - 20, 2, 11, leafD);
  rect(ctx, x - 1 + sway, floorY - 18, 5, 3, leaf);
  rect(ctx, x + 6 - sway, floorY - 16, 5, 3, leaf);
  rect(ctx, x + 1, floorY - 24 + sway, 4, 4, leaf);
  rect(ctx, x + 5, floorY - 22, 4, 3, leafD);
}

export function drawRoom(ctx: Ctx, width: number, height: number, now: Date, t: number) {
  const phase = dayPhase(now);
  // 壁
  rect(ctx, 0, 0, width, WALL_H, '#efe3cc');
  for (let x = 0; x < width; x += 8) rect(ctx, x, 0, 1, WALL_H - 8, '#e7d8bd');
  rect(ctx, 0, WALL_H - 8, width, 6, '#d2b994');
  rect(ctx, 0, WALL_H - 2, width, 2, '#8c6a4a');
  // 床
  rect(ctx, 0, WALL_H, width, height - WALL_H, '#c09163');
  for (let y = WALL_H + 6, i = 0; y < height; y += 7, i++) {
    rect(ctx, 0, y, width, 1, '#a97b50');
    for (let x = (i % 2) * 20; x < width; x += 40) rect(ctx, x, y - 6, 1, 6, '#b08356');
  }
  const ww = 56;
  drawWindow(ctx, Math.round(width / 2 - ww / 2), 8, ww, 32, phase, t);
  drawClock(ctx, 20, 20, now);
  drawShelf(ctx, width - 44, 14);
  drawPlant(ctx, width - 14, height - 2, t);
}

/** 夜は部屋全体を少し暗くする（机のライトが映えるように） */
export function drawNightTint(ctx: Ctx, width: number, height: number, now: Date) {
  const phase = dayPhase(now);
  if (phase === 'day') return;
  ctx.fillStyle = phase === 'night' ? 'rgba(20, 24, 60, 0.28)' : 'rgba(120, 50, 40, 0.10)';
  ctx.fillRect(0, 0, width, height);
}

// ───────────────────────── 席とアバター ─────────────────────────

export function seatPosition(index: number, cols: number, seatCount: number, width: number) {
  const row = Math.floor(index / cols);
  const inRow = Math.min(cols, seatCount - row * cols);
  const rowW = inRow * COL_W;
  const startX = (width - rowW) / 2;
  return {
    cx: Math.round(startX + (index % cols) * COL_W + COL_W / 2),
    deskY: FIRST_DESK_Y + row * ROW_H,
  };
}

const EYE = '#3a2a2a';

function drawHair(ctx: Ctx, cx: number, hy: number, a: Avatar, layer: 'back' | 'front') {
  const c = a.hairColor;
  const d = shade(c, -0.12);
  if (layer === 'back') {
    if (a.hair === 'long') rect(ctx, cx - 7, hy + 1, 14, 13, d);
    if (a.hair === 'bun') {
      rect(ctx, cx - 3, hy - 5, 6, 4, c);
      rect(ctx, cx - 2, hy - 6, 4, 1, c);
    }
    return;
  }
  rect(ctx, cx - 6, hy - 1, 12, 3, c);
  rect(ctx, cx - 5, hy - 2, 10, 1, c);
  rect(ctx, cx - 6, hy + 2, 1, a.hair === 'long' ? 9 : 4, c);
  rect(ctx, cx + 5, hy + 2, 1, a.hair === 'long' ? 9 : 4, c);
  // 前髪
  rect(ctx, cx - 5, hy + 2, 3, 1, c);
  rect(ctx, cx + 1, hy + 2, 4, 1, c);
  if (a.hair === 'spiky') {
    rect(ctx, cx - 6, hy - 3, 2, 2, c);
    rect(ctx, cx - 2, hy - 4, 2, 3, c);
    rect(ctx, cx + 2, hy - 3, 2, 2, c);
    rect(ctx, cx + 5, hy - 2, 2, 2, c);
  }
  px(ctx, cx - 3, hy - 1, shade(c, 0.18));
}

function drawHead(ctx: Ctx, cx: number, hy: number, a: Avatar, face: 'normal' | 'down' | 'happy' | 'sip') {
  drawHair(ctx, cx, hy, a, 'back');
  rect(ctx, cx - 5, hy, 10, 9, a.skin);
  rect(ctx, cx - 5, hy + 8, 10, 1, shade(a.skin, -0.08));
  if (face === 'down') {
    rect(ctx, cx - 4, hy + 6, 2, 1, EYE);
    rect(ctx, cx + 2, hy + 6, 2, 1, EYE);
  } else if (face === 'happy') {
    px(ctx, cx - 4, hy + 5, EYE);
    px(ctx, cx - 3, hy + 4, EYE);
    px(ctx, cx - 2, hy + 5, EYE);
    px(ctx, cx + 2, hy + 5, EYE);
    px(ctx, cx + 3, hy + 4, EYE);
    px(ctx, cx + 4, hy + 5, EYE);
    px(ctx, cx - 4, hy + 7, '#f19a9a');
    px(ctx, cx + 4, hy + 7, '#f19a9a');
  } else {
    rect(ctx, cx - 3, hy + 4, 1, 2, EYE);
    rect(ctx, cx + 2, hy + 4, 1, 2, EYE);
    if (face === 'sip') {
      px(ctx, cx - 4, hy + 7, '#f19a9a');
    } else {
      px(ctx, cx, hy + 7, shade(a.skin, -0.25));
    }
  }
  drawHair(ctx, cx, hy, a, 'front');
}

function drawTorso(ctx: Ctx, cx: number, top: number, bottom: number, a: Avatar) {
  rect(ctx, cx - 1, top - 1, 2, 1, shade(a.skin, -0.1));
  rect(ctx, cx - 7, top, 14, bottom - top, a.outfitColor);
  rect(ctx, cx - 7, top, 14, 1, shade(a.outfitColor, 0.1));
  rect(ctx, cx - 2, top, 4, 2, shade(a.outfitColor, -0.15));
}

function drawChair(ctx: Ctx, cx: number, deskY: number) {
  rect(ctx, cx - 9, deskY - 20, 18, 20, '#6b4a35');
  rect(ctx, cx - 8, deskY - 19, 16, 2, '#7e5a41');
}

function drawDesk(ctx: Ctx, cx: number, deskY: number) {
  rect(ctx, cx - 22, deskY + 17, 2, 6, '#6b4a35');
  rect(ctx, cx + 20, deskY + 17, 2, 6, '#6b4a35');
  rect(ctx, cx - 24, deskY, 48, 5, '#d9a66e');
  rect(ctx, cx - 24, deskY, 48, 1, '#e8bd88');
  rect(ctx, cx - 24, deskY + 5, 48, 12, '#a8744a');
  rect(ctx, cx - 24, deskY + 16, 48, 1, '#8e6040');
}

function drawLamp(ctx: Ctx, cx: number, deskY: number, on: boolean) {
  const lx = cx + 15;
  if (on) {
    ctx.fillStyle = 'rgba(255, 228, 140, 0.30)';
    ctx.beginPath();
    ctx.moveTo(lx - 3, deskY - 10);
    ctx.lineTo(lx + 3, deskY - 10);
    ctx.lineTo(lx + 6, deskY + 5);
    ctx.lineTo(lx - 22, deskY + 5);
    ctx.closePath();
    ctx.fill();
  }
  rect(ctx, lx - 2, deskY + 1, 6, 2, '#4a4a55');
  rect(ctx, lx + 1, deskY - 9, 1, 10, '#5d5d6a');
  rect(ctx, lx - 3, deskY - 12, 6, 3, '#e05d4f');
  if (on) rect(ctx, lx - 2, deskY - 9, 4, 1, '#fff3b0');
}

function drawBook(ctx: Ctx, cx: number, deskY: number) {
  rect(ctx, cx - 8, deskY + 1, 16, 3, '#fbfbf5');
  rect(ctx, cx - 8, deskY + 3, 16, 1, '#d8d8cc');
  rect(ctx, cx, deskY + 1, 1, 3, '#c8c8bc');
  rect(ctx, cx - 6, deskY + 2, 4, 1, '#b8c4d8');
}

function drawMug(ctx: Ctx, x: number, y: number) {
  rect(ctx, x, y, 3, 4, '#f5f5f5');
  rect(ctx, x + 3, y + 1, 1, 2, '#f5f5f5');
  rect(ctx, x, y, 3, 1, '#7a4a2a');
}

function drawBubble(ctx: Ctx, cx: number, y: number, text: string, bg: string, fg = '#ffffff') {
  const { width, size } = fitText(ctx, text, 6, COL_W - 6);
  const w = Math.ceil(width) + 6;
  const h = Math.ceil(size) + 4;
  const x = Math.round(cx - w / 2);
  const top = Math.round(y - h);
  rect(ctx, x + 1, top, w - 2, h, bg);
  rect(ctx, x, top + 1, w, h - 2, bg);
  rect(ctx, cx - 1, top + h, 3, 1, bg);
  px(ctx, cx, top + h + 1, bg);
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cx + 0.5, top + h / 2 + 0.5);
}

function drawNameplate(ctx: Ctx, cx: number, deskY: number, name: string, isMe: boolean, dim: boolean) {
  const { width } = fitText(ctx, name, 5, 40, 'bold');
  const w = Math.ceil(width) + 6;
  const x = Math.round(cx - w / 2);
  rect(ctx, x, deskY + 7, w, 8, isMe ? '#f2cc5b' : dim ? '#8a7a6a' : '#f3ead9');
  ctx.fillStyle = isMe ? '#3a2a10' : dim ? '#e0d6c8' : '#4a3a2a';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, cx + 0.5, deskY + 11.5);
}

export function drawSeat(ctx: Ctx, cx: number, deskY: number, seat: Seat, now: number, t: number) {
  const p = seat.presence;
  const status = effectiveStatus(p, now);
  const a = p?.avatar;
  const hy = deskY - 25;
  // 席ごとにアニメーションの位相をずらす
  const phaseOffset = (cx * 37) % 1000;
  const tt = t + phaseOffset;

  if (!p || !a) {
    drawChair(ctx, cx, deskY);
    drawDesk(ctx, cx, deskY);
    drawLamp(ctx, cx, deskY, false);
    drawNameplate(ctx, cx, deskY, '…', seat.isMe, true);
    return;
  }

  if (status === 'studying') {
    const bob = Math.floor(tt / 1200) % 2;
    drawChair(ctx, cx, deskY);
    drawTorso(ctx, cx, hy + 10, deskY, a);
    drawHead(ctx, cx, hy + 1 + bob, a, 'down');
    drawDesk(ctx, cx, deskY);
    drawBook(ctx, cx, deskY);
    drawLamp(ctx, cx, deskY, true);
    // 腕と手（右手でペンを動かす）
    const write = [0, 1, 2, 1][Math.floor(tt / 160) % 4];
    rect(ctx, cx - 9, deskY - 4, 3, 5, a.outfitColor);
    rect(ctx, cx - 8, deskY, 6, 2, a.outfitColor);
    rect(ctx, cx - 3, deskY, 2, 2, a.skin);
    rect(ctx, cx + 6, deskY - 4, 3, 5, a.outfitColor);
    rect(ctx, cx + 1 + write, deskY, 5, 2, a.outfitColor);
    rect(ctx, cx + write, deskY, 2, 2, a.skin);
    rect(ctx, cx + write, deskY - 3, 1, 3, '#e8c040');
    drawBubble(ctx, cx, hy - 6, `${p.category ?? '勉強'} ${shortDuration(studiedSec(p, now))}`, categoryColor(p.category ?? ''));
  } else if (status === 'break') {
    const stretching = Math.floor(tt / 2600) % 3 === 0;
    drawChair(ctx, cx, deskY);
    drawTorso(ctx, cx, hy + 10, deskY, a);
    if (stretching) {
      // 伸び
      const wave = Math.floor(tt / 400) % 2;
      rect(ctx, cx - 9, hy - 5 + wave, 2, 16, a.outfitColor);
      rect(ctx, cx + 7, hy - 5 + wave, 2, 16, a.outfitColor);
      rect(ctx, cx - 9, hy - 7 + wave, 2, 2, a.skin);
      rect(ctx, cx + 7, hy - 7 + wave, 2, 2, a.skin);
      drawHead(ctx, cx, hy - 1, a, 'happy');
      drawDesk(ctx, cx, deskY);
      drawMug(ctx, cx - 14, deskY - 3);
    } else {
      // 飲み物を飲む
      const sip = Math.floor(tt / 900) % 2;
      drawHead(ctx, cx, hy, a, 'sip');
      drawDesk(ctx, cx, deskY);
      rect(ctx, cx + 5, hy + 10, 3, 6 - sip, a.outfitColor);
      drawMug(ctx, cx + 1, hy + 5 + sip);
      rect(ctx, cx + 4, hy + 8 + sip, 2, 2, a.skin);
    }
    drawLamp(ctx, cx, deskY, false);
    drawBubble(ctx, cx, hy - 9, `休憩中 ${shortDuration(studiedSec(p, now))}`, '#d9a43a');
  } else if (status === 'away') {
    // 空席（椅子だけ）
    drawChair(ctx, cx, deskY);
    drawDesk(ctx, cx, deskY);
    drawLamp(ctx, cx, deskY, false);
    rect(ctx, cx - 6, deskY + 1, 9, 3, '#e8e2c8');
    drawBubble(ctx, cx, hy + 4, '離席中', '#8d8a96');
  } else {
    // オフライン：机で寝ている
    drawChair(ctx, cx, deskY);
    drawTorso(ctx, cx, deskY - 11, deskY, a);
    rect(ctx, cx - 7, deskY - 9, 14, 8, a.hairColor);
    rect(ctx, cx - 6, deskY - 10, 12, 1, a.hairColor);
    if (a.hair === 'bun') rect(ctx, cx - 3, deskY - 13, 6, 3, a.hairColor);
    if (a.hair === 'spiky') {
      rect(ctx, cx - 5, deskY - 12, 2, 2, a.hairColor);
      rect(ctx, cx + 3, deskY - 12, 2, 2, a.hairColor);
    }
    drawDesk(ctx, cx, deskY);
    rect(ctx, cx - 11, deskY - 1, 22, 4, a.outfitColor);
    rect(ctx, cx - 11, deskY - 1, 22, 1, shade(a.outfitColor, 0.1));
    drawLamp(ctx, cx, deskY, false);
    const z = Math.floor(tt / 700) % 3;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    for (let i = 0; i <= z; i++) {
      ctx.font = `bold ${4 + i}px ${FONT}`;
      ctx.fillText('z', cx + 6 + i * 4, deskY - 12 - i * 5);
    }
  }
  drawNameplate(ctx, cx, deskY, p.displayName, seat.isMe, status === 'offline');
}
