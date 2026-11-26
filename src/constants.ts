import type { Avatar, HairStyle } from './types';

export const DEFAULT_CATEGORIES = [
  '学校課題',
  'CG',
  '英語',
  'TOEIC',
  '基本情報',
  'paiza',
  'アプリ開発',
  '映画',
  'イラスト',
];

/** 1部屋の最大人数（仕様では未決定。描画は 4 列 × 2 行まで想定） */
export const MAX_ROOM_MEMBERS = 8;

/** この時間 presence が更新されなければオフライン扱いにする */
export const PRESENCE_STALE_MS = 5 * 60 * 1000;
/** 開いている間に updatedAt だけを送り直す間隔 */
export const PRESENCE_HEARTBEAT_MS = 60 * 1000;

/** これより短い記録は保存しない（押し間違い対策） */
export const MIN_SESSION_SEC = 60;

export const HAIR_STYLES: { id: HairStyle; label: string }[] = [
  { id: 'short', label: 'ショート' },
  { id: 'long', label: 'ロング' },
  { id: 'bun', label: 'おだんご' },
  { id: 'spiky', label: 'ツンツン' },
];

export const HAIR_COLORS = ['#2b1d16', '#6b4226', '#c58b4a', '#e8d27a', '#b84a3a', '#5a6fb8', '#9b9b9b'];
export const OUTFIT_COLORS = ['#e07a5f', '#3d8bd9', '#58a55c', '#f2cc5b', '#9a6bd1', '#f0f0f0', '#3a3a48'];
export const SKIN_COLORS = ['#f6d7b8', '#e9b88f', '#c68a5f', '#8d5a3b'];

export const DEFAULT_AVATAR: Avatar = {
  hair: 'short',
  hairColor: HAIR_COLORS[0],
  outfitColor: OUTFIT_COLORS[1],
  skin: SKIN_COLORS[0],
};
