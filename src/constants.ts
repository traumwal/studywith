import type { Avatar, DeskSet, HairStyle, Tone } from './types';

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

/** 1部屋の最大人数（いまは 2 人用の部屋。変えるときは firestore.rules も合わせる） */
export const MAX_ROOM_MEMBERS = 2;

/** この時間 presence が更新されなければオフライン扱いにする */
export const PRESENCE_STALE_MS = 5 * 60 * 1000;
/** 開いている間に updatedAt だけを送り直す間隔 */
export const PRESENCE_HEARTBEAT_MS = 60 * 1000;

/** これより短い記録は保存しない（押し間違い対策） */
export const MIN_SESSION_SEC = 60;

// ───── スタンプ・自動メッセージ・LOG ─────

export const DEFAULT_STAMPS = ['おつかれ', 'がんばれ', '休憩しよ', 'おやすみ'];
/** マイセットの最大数 */
export const MAX_STAMPS = 8;
/** メッセージの最大文字数（firestore.rules と合わせる） */
export const MAX_MESSAGE_LEN = 40;
/** 同じ人がスタンプを送れる間隔（アプリ側だけの制限） */
export const STAMP_COOLDOWN_MS = 3000;
/** 端末の時計のずれに備えて、部屋を開いた時刻のこれだけ前から受け取る */
export const MESSAGE_LOOKBACK_MS = 30 * 1000;
/** LOG に出す件数 */
export const LOG_LIMIT = 50;

/** 自動メッセージの口調。{分野} {時間} はその時の分野と勉強時間に置き換わる */
export const TONES: { id: Tone; label: string; start: string; break: string; stop: string }[] = [
  { id: 'plain', label: 'ふつう', start: '{分野} 開始', break: 'ちょっと休憩', stop: '{分野} {時間} 終わった' },
  { id: 'cat', label: 'ねこ', start: '{分野} するにゃ', break: 'ひと休みにゃ', stop: '{分野} {時間} できたにゃ' },
  { id: 'casual', label: 'ゆるい', start: '{分野}やるか〜', break: 'ちょっと休憩〜', stop: '{分野} {時間} おわり〜' },
  { id: 'genki', label: '元気', start: '{分野} スタート！', break: '休憩タイム！', stop: '{分野} {時間} やりきった！' },
];

export const HAIR_STYLES: { id: HairStyle; label: string }[] = [
  { id: 'short', label: 'ショート' },
  { id: 'long', label: 'ロング' },
  { id: 'bun', label: 'おだんご' },
  { id: 'spiky', label: 'ツンツン' },
];

export const HAIR_COLORS = ['#2b1d16', '#6b4226', '#c58b4a', '#e8d27a', '#b84a3a', '#5a6fb8', '#9b9b9b'];
export const OUTFIT_COLORS = ['#e07a5f', '#3d8bd9', '#58a55c', '#f2cc5b', '#9a6bd1', '#f0f0f0', '#3a3a48'];
export const SKIN_COLORS = ['#f6d7b8', '#e9b88f', '#c68a5f', '#8d5a3b'];

export const DESK_SETS: DeskSet[] = [
  { id: 'ash', label: 'アッシュ × 朱', top: '#e2cca2', frame: '#f2ece0', chair: '#f0643a', arm: '#2f5a3e' },
  { id: 'walnut', label: 'ウォルナット × 深緑', top: '#8a5a3a', frame: '#34343c', chair: '#2f6a4a', arm: '#34343c' },
  { id: 'white', label: 'ホワイト × コバルト', top: '#f7f5ef', frame: '#b8c0cc', chair: '#2f6fd6', arm: '#3a4a6a' },
  { id: 'oak', label: 'オーク × マスタード', top: '#d9ab6a', frame: '#f2ece0', chair: '#e0a82a', arm: '#2f5a3e' },
  { id: 'mortar', label: 'モルタル × ラベンダー', top: '#bdb8ae', frame: '#34343c', chair: '#9a7ad6', arm: '#34343c' },
];

export const DEFAULT_AVATAR: Avatar = {
  hair: 'short',
  hairColor: HAIR_COLORS[0],
  outfitColor: OUTFIT_COLORS[1],
  skin: SKIN_COLORS[0],
  desk: DESK_SETS[0].id,
};
