/**
 * 部屋の空を右から左へ横切るコメント（スタンプ・自動メッセージ）。
 *
 * - 空の帯に 2 レーン。空いているレーンに入り、両方埋まっていたら順番待ち
 * - 部屋の幅を約 10 秒で横切る。描画は部屋と同じ 12fps のままで、
 *   1 コマに約 2px ずつ進むカクカクした動きをドット絵らしさとして残す
 * - 吹き出しは 1 度だけオフスクリーン canvas に描き、毎フレームは位置をずらして写すだけ
 */

export interface FlowingComment {
  id: string;
  text: string;
  /** 吹き出しの左の四角の色（送った人の椅子の色） */
  color: string;
  /** 自動メッセージは少し透けた白で控えめにする */
  auto: boolean;
}

/** 部屋の幅を横切るのにかかる時間 */
export const COMMENT_CROSS_MS = 10_000;
/** レーンの上端（論理ピクセル）。頭上の吹き出しより上の、空の帯 */
export const COMMENT_LANES = [9, 23];
/** 前のコメントとの間隔 */
const GAP = 12;
const FONT = '"Hiragino Kaku Gothic ProN", "Noto Sans JP", "Meiryo", sans-serif';
const FONT_SIZE = 5.5;

interface Placed extends FlowingComment {
  lane: number;
  startedAt: number;
  width: number;
}

/** 文字幅を測る関数（テストでは差し替える） */
export type Measure = (text: string) => number;

let measureCtx: CanvasRenderingContext2D | null = null;
/** ブラウザでの文字幅 */
export const canvasMeasure: Measure = (text) => {
  measureCtx ??= document.createElement('canvas').getContext('2d')!;
  measureCtx.font = `bold ${FONT_SIZE}px ${FONT}`;
  return measureCtx.measureText(text).width;
};

export function bubbleWidth(textWidth: number) {
  return Math.ceil(textWidth) + 12;
}

/**
 * どのコメントをどのレーンに、いつ流すかを決める。描画とは分けておく（テストしやすいように）。
 * 全部同じ速さで動くので、前のコメントの右端が「部屋の右端 − 間隔」を過ぎたら次を入れられる。
 */
export class CommentScheduler {
  private waiting: FlowingComment[] = [];
  private placed: Placed[] = [];

  constructor(private measure: Measure) {}

  push(c: FlowingComment) {
    this.waiting.push(c);
  }

  /** now の時点で画面に出ているコメントと、その x 座標 */
  tick(now: number, roomWidth: number): (Placed & { x: number; y: number })[] {
    const speed = roomWidth / COMMENT_CROSS_MS;
    const xOf = (p: Placed) => Math.round(roomWidth - (now - p.startedAt) * speed);
    // 左端から出たものを捨てる
    this.placed = this.placed.filter((p) => xOf(p) + p.width > 0);
    // 空いたレーンに、待っているものを順に入れる
    while (this.waiting.length) {
      const lane = COMMENT_LANES.findIndex((_, i) => {
        const last = this.placed.filter((p) => p.lane === i).at(-1);
        return !last || xOf(last) + last.width + GAP <= roomWidth;
      });
      if (lane < 0) break;
      const c = this.waiting.shift()!;
      this.placed.push({ ...c, lane, startedAt: now, width: bubbleWidth(this.measure(c.text)) });
    }
    return this.placed.map((p) => ({ ...p, x: xOf(p), y: COMMENT_LANES[p.lane] }));
  }

  get size() {
    return this.waiting.length + this.placed.length;
  }
}

/** 吹き出しの画像。拡大率ごとに 1 度だけ描く */
const bubbleCache = new Map<string, HTMLCanvasElement>();

function bubbleImage(c: FlowingComment, scale: number): HTMLCanvasElement {
  const key = `${c.id}@${scale}`;
  const cached = bubbleCache.get(key);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  const g = canvas.getContext('2d')!;
  g.font = `bold ${FONT_SIZE}px ${FONT}`;
  const w = bubbleWidth(g.measureText(c.text).width);
  const h = Math.ceil(FONT_SIZE) + 5;
  canvas.width = (w + 1) * scale;
  canvas.height = (h + 1) * scale;
  g.scale(scale, scale);
  g.fillStyle = 'rgba(20,40,100,0.18)';
  g.fillRect(1, 1, w, h);
  g.fillStyle = '#ffffff';
  g.fillRect(1, 0, w - 2, h);
  g.fillRect(0, 1, w, h - 2);
  g.fillStyle = c.color;
  g.fillRect(3, Math.floor(h / 2) - 1, 3, 3);
  g.font = `bold ${FONT_SIZE}px ${FONT}`;
  g.fillStyle = '#1f3a78';
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.fillText(c.text, 8, h / 2 + 0.5);
  bubbleCache.set(key, canvas);
  return canvas;
}

export function drawComments(
  ctx: CanvasRenderingContext2D,
  scheduler: CommentScheduler,
  roomWidth: number,
  now: number,
  scale: number,
) {
  const shown = scheduler.tick(now, roomWidth);
  // 画面から出たコメントの画像は捨てる（まだ流れていないものは画像を作っていない）
  const alive = new Set(shown.map((c) => c.id));
  for (const key of bubbleCache.keys()) {
    if (!alive.has(key.slice(0, key.lastIndexOf('@')))) bubbleCache.delete(key);
  }
  for (const c of shown) {
    const img = bubbleImage(c, scale);
    ctx.globalAlpha = c.auto ? 0.78 : 1;
    ctx.drawImage(img, c.x, c.y, img.width / scale, img.height / scale);
  }
  ctx.globalAlpha = 1;
}
