import { DESK_SETS, PRESENCE_STALE_MS } from '../constants';
import { categoryColor } from '../lib/color';
import type { Avatar, DeskSet, Presence, PresenceStatus } from '../types';

/**
 * 2D 勉強部屋「空と水のテラス」の描画。すべて「論理ピクセル」で描き、呼び出し側で整数倍に拡大する。
 * 画像素材は使わず fillRect でドット絵を組み立てているので、
 * あとで自作のスプライトに差し替える場合はこのファイルだけを書き換えればよい。
 *
 * 1 フレームの描き順：
 *   drawRoom（空・水面・建物・床）→ drawSeat（机・椅子・アバター）
 *   → drawLighting（時間帯の暗さと明かり）→ drawSeatLabels（吹き出し・名前の看板）
 */

const BASE_W = 240;
const SEAT_GAP = 72;
const ROOM_H = 124;
const DESK_Y = 98;
const SKY_H = 47;
const FLOOR_Y = 61;
/** 左の柱の位置と、右の壁の幅 */
const LEFT_COL_X = 42;
const RIGHT_WALL_W = 34;
/** 自分の名前の看板の色 */
const ME_COLOR = '#f0643a';

/** メンバーがまだいない席の uid */
export const EMPTY_SEAT = '__empty__';

export interface Seat {
  uid: string;
  presence: Presence | undefined;
  isMe: boolean;
}

/** 席は最低 2 つ。人数が増えたら横に広げる */
export function roomSize(seatCount: number) {
  const n = Math.max(2, seatCount);
  return { width: Math.max(BASE_W, 96 + n * SEAT_GAP), height: ROOM_H };
}

export function seatPosition(index: number, seatCount: number, width: number) {
  const n = Math.max(2, seatCount);
  const startX = width / 2 - ((n - 1) * SEAT_GAP) / 2;
  return { cx: Math.round(startX + index * SEAT_GAP), deskY: DESK_Y };
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

export function deskSetOf(avatar: Avatar | undefined): DeskSet {
  return DESK_SETS.find((d) => d.id === avatar?.desk) ?? DESK_SETS[0];
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
type RGB = [number, number, number];

function rect(ctx: Ctx, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
}

function px(ctx: Ctx, x: number, y: number, color: string) {
  rect(ctx, x, y, 1, 1, color);
}

function line(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, color: string) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let i = 0; i <= n; i++) px(ctx, x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, color);
}

function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function shade(hex: string, amount: number): string {
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v + amount * 255)));
  const [r, g, b] = hexToRgb(hex);
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

function isDark(hex: string): boolean {
  const [r, g, b] = hexToRgb(hex);
  return r * 0.299 + g * 0.587 + b * 0.114 < 140;
}

/** 同じ seed なら同じ並びになる乱数（雲や木の形を毎フレーム同じにする） */
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 網点・ディザ用の 4×4 のしきい値 */
const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];
function dither(x: number, y: number, v: number) {
  return v * 16 > BAYER[y & 3][x & 3] + 0.5;
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

function drawText(ctx: Ctx, text: string, x: number, y: number, color: string, align: CanvasTextAlign = 'center') {
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
}

// ───────────────────────── 時間帯 ─────────────────────────

type DayPhase = 'day' | 'evening' | 'night';

export function dayPhase(date: Date): DayPhase {
  const h = date.getHours();
  if (h >= 6 && h < 16) return 'day';
  if (h >= 16 && h < 19) return 'evening';
  return 'night';
}

interface ScenePalette {
  skyTop: string;
  skyBottom: string;
  cloudLight: string;
  cloudMid: string;
  cloudShadow: string;
  glass: string;
  glassLine: string;
  concrete: string;
  concreteShade: string;
  tile: string;
  floorShadow: string;
  water: string;
  leaf: [string, string, string];
  trunk: string;
  door: string;
}

const PALETTES: Record<DayPhase, ScenePalette> = {
  day: {
    skyTop: '#1c56d0', skyBottom: '#4a92f0', cloudLight: '#fff6ec', cloudMid: '#c4d8f6', cloudShadow: '#7fa6e6',
    glass: '#3a74d8', glassLine: '#7aa8ee', concrete: '#f1f1ee', concreteShade: '#bccbe6', tile: '#d8dee8',
    floorShadow: 'rgba(60,110,210,0.26)', water: '#1846b0', leaf: ['#1f4a2e', '#2f6a3a', '#4f8f48'], trunk: '#5a3a2a', door: '#f0643a',
  },
  evening: {
    skyTop: '#2a2f86', skyBottom: '#f6a066', cloudLight: '#ffe2bc', cloudMid: '#f2a07e', cloudShadow: '#8e5a8e',
    glass: '#6a5aa8', glassLine: '#e8a08a', concrete: '#f4e0d0', concreteShade: '#b896b4', tile: '#e6cfc2',
    floorShadow: 'rgba(90,50,120,0.30)', water: '#4a3a90', leaf: ['#2a2a2e', '#4a4a36', '#7a6a3e'], trunk: '#4a2a2a', door: '#f0643a',
  },
  night: {
    skyTop: '#050a26', skyBottom: '#18306e', cloudLight: '#7484b8', cloudMid: '#36468a', cloudShadow: '#1e2a60',
    glass: '#16224a', glassLine: '#2a3a6a', concrete: '#4a5478', concreteShade: '#2a3456', tile: '#424c70',
    floorShadow: 'rgba(0,0,20,0.35)', water: '#081444', leaf: ['#0c1a1c', '#16302a', '#24402e'], trunk: '#1a1420', door: '#c0502e',
  },
};

// ───────────────────────── 空（網点の入道雲） ─────────────────────────

/** 横に流すため、空は部屋より広い帯として 1 度だけ描いておく */
const SKY_STRIP_W = 640;
const skyCache = new Map<DayPhase, HTMLCanvasElement>();

function buildSky(phase: DayPhase): HTMLCanvasElement {
  const pal = PALETTES[phase];
  const cw = SKY_STRIP_W;
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = SKY_H;
  const g = canvas.getContext('2d')!;
  const img = g.createImageData(cw, SKY_H);
  const d = img.data;
  const top = hexToRgb(pal.skyTop);
  const bottom = hexToRgb(pal.skyBottom);
  const light = hexToRgb(pal.cloudLight);
  const mid = hexToRgb(pal.cloudMid);
  const dark = hexToRgb(pal.cloudShadow);

  // 雲は円の集まり。地平線から立ち上がる入道雲を 4 つ
  const r = rng(42);
  const blobs: [number, number, number][] = [];
  const tower = (cx: number, s: number, n: number) => {
    for (let j = 0; j < 9; j++) blobs.push([cx + (j - 4) * 7 * s, SKY_H - 2, 7 * s]);
    for (let i = 0; i < n; i++) {
      const u = (r() - 0.5) * 2;
      const h = r();
      blobs.push([
        cx + u * 26 * s * (1 - h * 0.55),
        SKY_H - 4 - h * 46 * s * (1 - Math.abs(u) * 0.55),
        (6 + r() * 7) * s * (1 - h * 0.35),
      ]);
    }
  };
  tower(cw * 0.2, 1.0, 30);
  tower(cw * 0.66, 1.25, 36);
  tower(cw * 0.42, 0.45, 8);
  tower(cw * 0.9, 0.55, 10);

  const mix = (a: RGB, b: RGB, k: number): RGB => [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * k)) as RGB;

  for (let y = 0; y < SKY_H; y++) {
    for (let x = 0; x < cw; x++) {
      // 空のグラデーションは 4 段階＋ディザ
      const k = y / SKY_H;
      const step = Math.floor(k * 4);
      let col = mix(top, bottom, Math.min(1, (step + (dither(x, y, k * 4 - step) ? 1 : 0)) / 4));
      if (phase === 'night' && (x * 73 + y * 151) % 197 === 0) col = [255, 255, 255];

      let best = 0;
      let lit = 0;
      for (const [bx, by, br] of blobs) {
        const dx = ((((x - bx) % cw) + cw * 1.5) % cw) - cw / 2;
        const dy = y - by;
        const q = 1 - (dx * dx + dy * dy) / (br * br);
        if (q > best) {
          best = q;
          lit = (-dx * 0.5 - dy) / br; // 左上から光が当たる
        }
      }
      if (best > 0) {
        // ふちは網点で空に溶かす
        const edge = best < 0.18 && !dither(x, y, best / 0.18);
        if (!edge) {
          const v = 0.5 + lit * 0.45 + best * 0.15;
          if (v > 0.66) col = light;
          else if (v > 0.5) col = dither(x, y, (v - 0.5) / 0.16) ? light : mid;
          else if (v > 0.3) col = dither(x, y, (v - 0.3) / 0.2) ? mid : dark;
          else col = dark;
        }
      }
      const i = (y * cw + x) * 4;
      d[i] = col[0];
      d[i + 1] = col[1];
      d[i + 2] = col[2];
      d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return canvas;
}

function skyFor(phase: DayPhase) {
  let sky = skyCache.get(phase);
  if (!sky) {
    sky = buildSky(phase);
    skyCache.set(phase, sky);
  }
  return sky;
}

/** 空の帯の 1 行を、横にずらしながら（端はつなげて）写す */
function skyRow(ctx: Ctx, sky: HTMLCanvasElement, width: number, srcY: number, dstY: number, offset: number) {
  const cw = SKY_STRIP_W;
  let x = 0;
  let o = ((Math.round(offset) % cw) + cw) % cw;
  while (x < width) {
    const w = Math.min(width - x, cw - o);
    ctx.drawImage(sky, o, srcY, w, 1, x, dstY, w, 1);
    x += w;
    o = 0;
  }
}

// ───────────────────────── 部屋 ─────────────────────────

let treeLeaves: [number, number][] | null = null;

function drawTree(ctx: Ctx, cx: number, cy: number, pal: ScenePalette, t: number) {
  if (!treeLeaves) {
    const r = rng(17);
    treeLeaves = Array.from({ length: 1700 }, () => {
      const a = r() * Math.PI * 2;
      const rad = Math.sqrt(r()) * 15;
      return [Math.cos(a) * rad * 1.15, Math.sin(a) * rad];
    });
  }
  rect(ctx, cx - 1, cy + 4, 3, FLOOR_Y - 3 - (cy + 4), pal.trunk);
  rect(ctx, cx - 4, FLOOR_Y - 5, 10, 4, pal.concreteShade);
  for (const [dx, dy] of treeLeaves) {
    const x = Math.round(cx + dx);
    const y = Math.round(cy + dy);
    const sway = Math.round(Math.sin(t / 900 + y * 0.2) * 0.6 * (1 - (dy + 15) / 30));
    const lit = (-dx * 0.4 - dy) / 15;
    const c = lit > 0.35 ? pal.leaf[2] : lit > -0.3 ? (dither(x, y, lit + 0.3) ? pal.leaf[2] : pal.leaf[1]) : pal.leaf[0];
    px(ctx, x + sway, y, c);
  }
}

export function drawRoom(ctx: Ctx, width: number, height: number, now: Date, t: number) {
  const phase = dayPhase(now);
  const pal = PALETTES[phase];
  const night = phase === 'night';
  const sky = skyFor(phase);
  const offset = t / 300 + SKY_STRIP_W * 0.2 - width / 2;
  const rightWallX = width - RIGHT_WALL_W;
  const rightColX = rightWallX - 6;
  const moonX = Math.round(width * 0.72);

  // 空
  for (let y = 0; y < SKY_H; y++) skyRow(ctx, sky, width, y, y, offset);
  if (night) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        if (dx * dx + dy * dy <= 18) px(ctx, moonX + dx, 16 + dy, dx + dy > 3 ? '#c8cce0' : '#f6f2d8');
      }
    }
  }

  // 水面：空を上下逆に映して、行ごとに揺らす
  for (let y = SKY_H; y < 58; y++) {
    const k = y - SKY_H;
    const src = Math.max(8, SKY_H - 2 - k * 3);
    skyRow(ctx, sky, width, src, y, offset + Math.round(Math.sin(t / 380 + k * 0.9) * (1 + k * 0.25)));
  }
  ctx.globalAlpha = 0.38;
  rect(ctx, 0, SKY_H, width, 58 - SKY_H, pal.water);
  ctx.globalAlpha = 1;
  ctx.fillStyle = night ? 'rgba(200,210,255,0.25)' : 'rgba(255,255,255,0.45)';
  for (let k = 0; k < 8; k++) {
    ctx.fillRect(Math.round((k * 43 + t / 50) % width), SKY_H + 2 + ((k * 5) % 9), 4 + (k % 3), 1);
  }
  if (night) {
    for (let y = SKY_H + 1; y < 58; y += 2) rect(ctx, moonX - 1 + Math.round(Math.sin(t / 300 + y) * 1.5), y, 3, 1, 'rgba(246,242,216,0.55)');
  }

  // 左：ガラスの建物
  rect(ctx, 0, 0, 40, 58, pal.glass);
  for (let x = 2; x < 40; x += 4) rect(ctx, x, 0, 1, 58, pal.glassLine);
  for (let y = 10; y < 58; y += 12) rect(ctx, 0, y, 40, 1, pal.glassLine);
  if (phase === 'day') {
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath();
    ctx.moveTo(4, 58);
    ctx.lineTo(22, 0);
    ctx.lineTo(30, 0);
    ctx.lineTo(12, 58);
    ctx.fill();
  } else if (phase === 'evening') {
    ctx.fillStyle = 'rgba(255,170,110,0.25)';
    ctx.fillRect(0, 0, 40, 58);
  } else {
    const r = rng(8);
    for (let y = 1; y < 58; y += 12) for (let x = 0; x < 40; x += 4) if (r() > 0.7) rect(ctx, x + 1, y + 3, 2, 4, '#f0c868');
  }
  drawTree(ctx, 30, 26, pal, t);

  // 右：白い壁と朱色の扉
  rect(ctx, rightWallX, 0, RIGHT_WALL_W, 58, pal.concrete);
  rect(ctx, rightWallX, 0, 2, 58, pal.concreteShade);
  rect(ctx, rightWallX + 12, 20, 13, 38, pal.door);
  rect(ctx, rightWallX + 12, 20, 13, 1, shade(pal.door, 0.12));
  rect(ctx, rightWallX + 22, 38, 1, 3, shade(pal.door, -0.25));

  // 細い柱
  for (const x of [LEFT_COL_X, rightColX]) {
    rect(ctx, x, 0, 3, 58, pal.concrete);
    rect(ctx, x + 2, 0, 1, 58, pal.concreteShade);
  }

  // 天井のスラブ。昼と夕方は裏に水の反射がゆらめく
  rect(ctx, 0, 0, width, 6, pal.concrete);
  rect(ctx, 0, 5, width, 2, pal.concreteShade);
  if (!night) {
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    for (let k = 0; k < 30; k++) {
      ctx.fillRect(Math.round((k * 37 + Math.sin(t / 500 + k) * 4) % width), 5 + (k % 2), 3 + (k % 4), 1);
    }
  }

  // ガラスの手すり
  const railX = LEFT_COL_X + 2;
  const railW = rightColX - railX;
  ctx.fillStyle = night ? 'rgba(150,180,255,0.10)' : 'rgba(220,240,255,0.22)';
  ctx.fillRect(railX, 50, railW, 8);
  rect(ctx, railX, 49, railW, 1, pal.concrete);
  for (let x = railX + 8; x < rightColX; x += 16) rect(ctx, x, 49, 1, 9, pal.concreteShade);

  // 床（タイル）と、天井の影
  rect(ctx, 0, 58, width, 3, pal.concrete);
  rect(ctx, 0, 60, width, 1, pal.concreteShade);
  rect(ctx, 0, FLOOR_Y, width, height - FLOOR_Y, pal.concrete);
  for (let y = FLOOR_Y; y < height; y += 9) rect(ctx, 0, y, width, 1, pal.tile);
  for (let x = 0; x < width; x += 18) rect(ctx, x, FLOOR_Y, 1, height - FLOOR_Y, pal.tile);
  ctx.fillStyle = pal.floorShadow;
  ctx.beginPath();
  ctx.moveTo(0, FLOOR_Y);
  ctx.lineTo(width * 0.52, FLOOR_Y);
  ctx.lineTo(width * 0.33, height);
  ctx.lineTo(0, height);
  ctx.fill();
}

function glow(ctx: Ctx, x: number, y: number, r: number, rgb: string, a: number) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${rgb},${a})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

/**
 * 時間帯の暗さと明かり。勉強中の人のライトだけが灯る。
 * litSeats は勉強中の席の中心 x 座標。
 */
export function drawLighting(ctx: Ctx, width: number, height: number, now: Date, litSeats: number[]) {
  const phase = dayPhase(now);
  const lamp = (alpha: number, r: number) => litSeats.forEach((cx) => glow(ctx, cx + 10, DESK_Y - 7, r, '255,205,125', alpha));
  if (phase === 'evening') {
    ctx.fillStyle = 'rgba(70,20,70,0.10)';
    ctx.fillRect(0, 0, width, height);
  } else if (phase === 'night') {
    ctx.fillStyle = 'rgba(2,6,28,0.30)';
    ctx.fillRect(0, 0, width, height);
  }
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  if (phase === 'day') {
    glow(ctx, width - 20, 0, 90, '255,250,230', 0.12);
  } else if (phase === 'evening') {
    glow(ctx, width, 20, 140, '255,150,80', 0.18);
    lamp(0.25, 16);
  } else {
    glow(ctx, Math.round(width * 0.72), 16, 26, '220,225,255', 0.2);
    glow(ctx, 20, 30, 30, '240,200,104', 0.12);
    lamp(0.42, 28);
  }
  ctx.restore();
}

// ───────────────────────── 席とアバター ─────────────────────────

const EYE = '#3a2a2a';
const PANTS = '#28365e';

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

/** 角の丸いスチールチェアの背もたれ（体より奥） */
function drawChairBack(ctx: Ctx, cx: number, deskY: number, set: DeskSet) {
  const c = set.chair;
  rect(ctx, cx - 7, deskY - 19, 14, 15, c);
  rect(ctx, cx - 8, deskY - 18, 16, 13, c);
  rect(ctx, cx - 6, deskY - 19, 12, 1, shade(c, 0.15));
  rect(ctx, cx - 8, deskY - 18, 1, 13, shade(c, -0.12));
  rect(ctx, cx + 7, deskY - 18, 1, 13, shade(c, -0.12));
}

/** 天板の下に見えるもの：床の影・椅子の座面と脚・座っている人の足 */
function drawUnderDesk(ctx: Ctx, cx: number, deskY: number, set: DeskSet, seated: boolean) {
  const c = set.chair;
  ctx.fillStyle = 'rgba(30,70,160,0.14)';
  ctx.fillRect(cx - 25, deskY + 17, 50, 2);
  rect(ctx, cx - 9, deskY + 5, 18, 2, c);
  rect(ctx, cx - 9, deskY + 5, 18, 1, shade(c, 0.15));
  rect(ctx, cx - 8, deskY + 7, 1, 9, set.frame);
  rect(ctx, cx + 7, deskY + 7, 1, 9, set.frame);
  rect(ctx, cx - 9, deskY + 16, 18, 1, shade(set.frame, -0.15));
  if (!seated) return;
  rect(ctx, cx - 6, deskY + 3, 12, 3, PANTS);
  rect(ctx, cx - 5, deskY + 6, 4, 8, PANTS);
  rect(ctx, cx + 1, deskY + 6, 4, 8, PANTS);
  for (const x of [cx - 6, cx + 1]) {
    rect(ctx, x, deskY + 14, 5, 2, '#ffffff');
    rect(ctx, x, deskY + 15, 5, 1, '#d0d8e8');
  }
}

/** 細い角パイプのフレームと天板だけの机（向こうが透けて見える）＋ 鉢植え */
function drawDesk(ctx: Ctx, cx: number, deskY: number, set: DeskSet, seated: boolean) {
  drawUnderDesk(ctx, cx, deskY, set, seated);
  const frameShade = shade(set.frame, -0.15);
  rect(ctx, cx - 23, deskY + 3, 46, 1, frameShade);
  ctx.globalAlpha = 0.6;
  rect(ctx, cx - 21, deskY + 13, 42, 1, frameShade);
  ctx.globalAlpha = 1;
  for (const x of [cx - 24, cx + 22]) {
    rect(ctx, x, deskY + 3, 2, 14, set.frame);
    rect(ctx, x + 1, deskY + 3, 1, 14, frameShade);
    rect(ctx, x - 1, deskY + 17, 4, 1, frameShade);
  }
  rect(ctx, cx - 26, deskY, 52, 2, set.top);
  rect(ctx, cx - 26, deskY, 52, 1, shade(set.top, 0.06));
  rect(ctx, cx - 26, deskY + 2, 52, 1, shade(set.top, -0.15));
  const grain = shade(set.top, -0.06);
  for (const [o, l] of [[-20, 5], [-6, 7], [9, 4], [17, 5]]) rect(ctx, cx + o, deskY + 1, l, 1, grain);
  // コンクリート鉢のグリーン
  const pot = '#d8d3c8';
  rect(ctx, cx - 25, deskY - 4, 5, 4, pot);
  rect(ctx, cx - 21, deskY - 3, 1, 3, shade(pot, -0.1));
  const leaves: [number, number, number][] = [[-24, 4, 1], [-23, 6, 0], [-22, 5, 1], [-21, 3, 0]];
  for (const [o, h, k] of leaves) rect(ctx, cx + o, deskY - 4 - h, 1, h, k ? '#4f8f48' : '#2f6a3a');
  px(ctx, cx - 25, deskY - 7, '#4f8f48');
}

/** クランプ式のワークライト。シェードは椅子と同じ色 */
function drawLamp(ctx: Ctx, cx: number, deskY: number, set: DeskSet, on: boolean) {
  const clamp = '#5a5a66';
  rect(ctx, cx + 20, deskY - 1, 3, 1, clamp);
  rect(ctx, cx + 22, deskY - 1, 1, 5, clamp);
  rect(ctx, cx + 20, deskY + 3, 3, 1, clamp);
  line(ctx, cx + 21, deskY - 2, cx + 18, deskY - 10, set.arm);
  line(ctx, cx + 18, deskY - 10, cx + 12, deskY - 13, set.arm);
  px(ctx, cx + 18, deskY - 10, clamp);
  const c = set.chair;
  rect(ctx, cx + 10, deskY - 14, 3, 1, c);
  rect(ctx, cx + 9, deskY - 13, 5, 1, c);
  rect(ctx, cx + 8, deskY - 12, 6, 1, c);
  rect(ctx, cx + 8, deskY - 11, 6, 1, shade(c, -0.15));
  if (on) rect(ctx, cx + 9, deskY - 10, 4, 1, '#fff3b0');
}

function drawBook(ctx: Ctx, cx: number, deskY: number) {
  rect(ctx, cx - 8, deskY + 1, 16, 3, '#fbfbf5');
  rect(ctx, cx - 8, deskY + 3, 16, 1, '#d8d8cc');
  rect(ctx, cx, deskY + 1, 1, 3, '#c8c8bc');
  rect(ctx, cx - 6, deskY + 2, 4, 1, '#b8c4d8');
}

function drawWater(ctx: Ctx, x: number, y: number) {
  rect(ctx, x, y, 3, 6, 'rgba(190,225,255,0.85)');
  rect(ctx, x, y + 3, 3, 3, 'rgba(90,160,240,0.8)');
  px(ctx, x + 1, y + 1, '#ffffff');
}

function drawSoda(ctx: Ctx, x: number, y: number, straw: string) {
  rect(ctx, x, y - 1, 3, 5, 'rgba(200,230,255,0.9)');
  rect(ctx, x, y + 1, 3, 3, 'rgba(240,120,80,0.8)');
  rect(ctx, x + 2, y - 3, 1, 3, straw);
}

/** 席ごとにアニメーションの位相をずらす */
function seatTime(cx: number, t: number) {
  return t + ((cx * 37) % 1000);
}

/** 机・椅子・アバター。吹き出しと名前は drawSeatLabels で、明かりの後に描く */
export function drawSeat(ctx: Ctx, cx: number, deskY: number, seat: Seat, now: number, t: number) {
  const p = seat.presence;
  const status = effectiveStatus(p, now);
  const a = p?.avatar;
  const set = deskSetOf(a);
  const hy = deskY - 25;
  const tt = seatTime(cx, t);

  if (!p || !a) {
    drawChairBack(ctx, cx, deskY, set);
    drawDesk(ctx, cx, deskY, set, false);
    drawLamp(ctx, cx, deskY, set, false);
    return;
  }

  if (status === 'studying') {
    const bob = Math.floor(tt / 1200) % 2;
    drawChairBack(ctx, cx, deskY, set);
    drawTorso(ctx, cx, hy + 10, deskY, a);
    drawHead(ctx, cx, hy + 1 + bob, a, 'down');
    drawDesk(ctx, cx, deskY, set, true);
    drawBook(ctx, cx, deskY);
    drawWater(ctx, cx - 17, deskY - 5);
    drawLamp(ctx, cx, deskY, set, true);
    // 腕と手（右手でペンを動かす）
    const write = [0, 1, 2, 1][Math.floor(tt / 160) % 4];
    rect(ctx, cx - 9, deskY - 4, 3, 5, a.outfitColor);
    rect(ctx, cx - 8, deskY, 6, 2, a.outfitColor);
    rect(ctx, cx - 3, deskY, 2, 2, a.skin);
    rect(ctx, cx + 6, deskY - 4, 3, 5, a.outfitColor);
    rect(ctx, cx + 1 + write, deskY, 5, 2, a.outfitColor);
    rect(ctx, cx + write, deskY, 2, 2, a.skin);
    rect(ctx, cx + write, deskY - 3, 1, 3, set.chair);
  } else if (status === 'break') {
    const stretching = Math.floor(tt / 2600) % 3 === 0;
    drawChairBack(ctx, cx, deskY, set);
    drawTorso(ctx, cx, hy + 10, deskY, a);
    if (stretching) {
      // 伸び
      const wave = Math.floor(tt / 400) % 2;
      rect(ctx, cx - 9, hy - 5 + wave, 2, 16, a.outfitColor);
      rect(ctx, cx + 7, hy - 5 + wave, 2, 16, a.outfitColor);
      rect(ctx, cx - 9, hy - 7 + wave, 2, 2, a.skin);
      rect(ctx, cx + 7, hy - 7 + wave, 2, 2, a.skin);
      drawHead(ctx, cx, hy - 1, a, 'happy');
      drawDesk(ctx, cx, deskY, set, true);
      drawSoda(ctx, cx - 15, deskY - 4, set.chair);
    } else {
      // 飲み物を飲む
      const sip = Math.floor(tt / 900) % 2;
      drawHead(ctx, cx, hy, a, 'sip');
      drawDesk(ctx, cx, deskY, set, true);
      rect(ctx, cx + 5, hy + 10, 3, 6 - sip, a.outfitColor);
      drawSoda(ctx, cx + 1, hy + 5 + sip, set.chair);
      rect(ctx, cx + 4, hy + 8 + sip, 2, 2, a.skin);
    }
    drawLamp(ctx, cx, deskY, set, false);
  } else if (status === 'away') {
    // 空席（椅子だけ）
    drawChairBack(ctx, cx, deskY, set);
    drawDesk(ctx, cx, deskY, set, false);
    drawBook(ctx, cx, deskY);
    drawLamp(ctx, cx, deskY, set, false);
  } else {
    // オフライン：机で寝ている
    drawChairBack(ctx, cx, deskY, set);
    drawTorso(ctx, cx, deskY - 11, deskY, a);
    rect(ctx, cx - 7, deskY - 9, 14, 8, a.hairColor);
    rect(ctx, cx - 6, deskY - 10, 12, 1, a.hairColor);
    if (a.hair === 'bun') rect(ctx, cx - 3, deskY - 13, 6, 3, a.hairColor);
    if (a.hair === 'spiky') {
      rect(ctx, cx - 5, deskY - 12, 2, 2, a.hairColor);
      rect(ctx, cx + 3, deskY - 12, 2, 2, a.hairColor);
    }
    drawDesk(ctx, cx, deskY, set, true);
    rect(ctx, cx - 11, deskY - 1, 22, 4, a.outfitColor);
    rect(ctx, cx - 11, deskY - 1, 22, 1, shade(a.outfitColor, 0.1));
    drawLamp(ctx, cx, deskY, set, false);
  }
}

/** 白い吹き出し：分野の色の四角 ＋ 文字 */
function drawBubble(ctx: Ctx, cx: number, y: number, text: string, dot: string) {
  const { width, size } = fitText(ctx, text, 5.5, 54);
  const w = Math.ceil(width) + 12;
  const h = Math.ceil(size) + 5;
  const x = Math.round(cx - w / 2);
  const top = Math.round(y - h);
  ctx.fillStyle = 'rgba(20,40,100,0.18)';
  ctx.fillRect(x + 1, top + 1, w, h);
  rect(ctx, x + 1, top, w - 2, h, '#ffffff');
  rect(ctx, x, top + 1, w, h - 2, '#ffffff');
  rect(ctx, cx - 1, top + h, 3, 1, '#ffffff');
  px(ctx, cx, top + h + 1, '#ffffff');
  rect(ctx, x + 3, top + Math.floor(h / 2) - 1, 3, 3, dot);
  drawText(ctx, text, x + 8, top + h / 2 + 0.5, '#1f3a78', 'left');
}

/** 天板からワイヤーで吊り下げた名前の看板（ゆっくり揺れる） */
function drawNameSign(ctx: Ctx, cx: number, deskY: number, name: string, set: DeskSet, isMe: boolean, dim: boolean, t: number) {
  const sway = Math.round(Math.sin(t / 1100 + cx) * 0.7);
  const { width, size } = fitText(ctx, name, 4.5, 34);
  const w = Math.ceil(width) + 6;
  const x = Math.round(cx - w / 2) + sway;
  const top = deskY + 7;
  const board = isMe ? ME_COLOR : set.top;
  ctx.globalAlpha = dim ? 0.6 : 1;
  ctx.strokeStyle = shade(set.frame, -0.15);
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(cx - w / 2 + 2, deskY + 3);
  ctx.lineTo(x + 2, top);
  ctx.moveTo(cx + w / 2 - 2, deskY + 3);
  ctx.lineTo(x + w - 2, top);
  ctx.stroke();
  ctx.fillStyle = 'rgba(20,40,90,0.18)';
  ctx.fillRect(x + 1, top + 1, w, 7);
  rect(ctx, x, top, w, 7, board);
  rect(ctx, x, top, w, 1, shade(board, 0.1));
  rect(ctx, x, top + 6, w, 1, shade(board, -0.15));
  px(ctx, x + 2, top + 1, shade(set.frame, -0.15));
  px(ctx, x + w - 3, top + 1, shade(set.frame, -0.15));
  ctx.font = `bold ${size}px ${FONT}`;
  drawText(ctx, name, x + w / 2 + 0.5, top + 3.8, isMe || isDark(board) ? '#ffffff' : '#4a3420');
  ctx.globalAlpha = 1;
}

function drawZzz(ctx: Ctx, x: number, y: number, tt: number, color: string) {
  const z = Math.floor(tt / 700) % 3;
  for (let i = 0; i <= z; i++) {
    ctx.font = `bold ${4 + i}px ${FONT}`;
    drawText(ctx, 'z', x + i * 4, y - i * 5, color, 'left');
  }
}

/** 吹き出し・名前の看板・寝息。暗さの影響を受けないよう、明かりの後に描く */
export function drawSeatLabels(ctx: Ctx, cx: number, deskY: number, seat: Seat, now: number, t: number) {
  const p = seat.presence;
  const status = effectiveStatus(p, now);
  const set = deskSetOf(p?.avatar);
  const hy = deskY - 25;
  const tt = seatTime(cx, t);

  if (!p || !p.avatar) {
    // 招待待ちの席は「空席」、メンバーだがまだ一度も開いていない人は「…」
    drawNameSign(ctx, cx, deskY, seat.uid === EMPTY_SEAT ? '空席' : '…', set, seat.isMe, true, t);
    return;
  }
  if (status === 'studying') {
    drawBubble(ctx, cx, hy - 6, `${p.category ?? '勉強'} ${shortDuration(studiedSec(p, now))}`, categoryColor(p.category ?? ''));
  } else if (status === 'break') {
    drawBubble(ctx, cx, hy - 9, `休憩中 ${shortDuration(studiedSec(p, now))}`, '#d9a43a');
  } else if (status === 'away') {
    drawBubble(ctx, cx, hy + 4, '離席中', '#8d8a96');
  } else {
    const night = dayPhase(new Date(now)) === 'night';
    drawZzz(ctx, cx + 6, deskY - 12, tt, night ? 'rgba(255,255,255,0.85)' : 'rgba(40,70,150,0.7)');
  }
  drawNameSign(ctx, cx, deskY, p.displayName, set, seat.isMe, status === 'offline', t);
}

/** 設定画面のプレビュー用の小さな背景（昼のテラス） */
export function drawPreviewBackdrop(ctx: Ctx, width: number, height: number, floorY: number) {
  const pal = PALETTES.day;
  rect(ctx, 0, 0, width, floorY, pal.skyBottom);
  rect(ctx, 0, 0, width, Math.round(floorY / 3), pal.skyTop);
  rect(ctx, 0, floorY - 6, width, 1, pal.concrete);
  ctx.fillStyle = 'rgba(220,240,255,0.22)';
  ctx.fillRect(0, floorY - 5, width, 5);
  rect(ctx, 0, floorY, width, height - floorY, pal.concrete);
  for (let y = floorY + 4; y < height; y += 9) rect(ctx, 0, y, width, 1, pal.tile);
}
