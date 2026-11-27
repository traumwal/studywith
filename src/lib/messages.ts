import { DEFAULT_STAMPS, MAX_MESSAGE_LEN, TONES } from '../constants';
import type { MessageKind, RoomMessage, Tone, UserProfile } from '../types';
import { formatDuration } from './time';

export type AutoKind = Exclude<MessageKind, 'stamp'>;

export function stampsOf(profile: UserProfile): string[] {
  return profile.stamps ?? DEFAULT_STAMPS;
}

export function toneOf(profile: UserProfile): Tone {
  return TONES.some((t) => t.id === profile.tone) ? profile.tone! : 'plain';
}

/** 自動メッセージの文章を組み立てる（例：英語 50分 終わった） */
export function autoMessageText(tone: Tone, kind: AutoKind, category: string, durationSec = 0): string {
  const t = TONES.find((x) => x.id === tone) ?? TONES[0];
  const template = kind === 'auto-start' ? t.start : kind === 'auto-break' ? t.break : t.stop;
  const text = template.replace('{分野}', category).replace('{時間}', formatDuration(durationSec));
  return clampText(text);
}

/** 最大文字数に収める（絵文字なども 1 文字として数える） */
export function clampText(text: string): string {
  const chars = [...text.trim()];
  return chars.length > MAX_MESSAGE_LEN ? chars.slice(0, MAX_MESSAGE_LEN).join('') : chars.join('');
}

/** 2 つの一覧を id で重ねて、新しい順に limit 件 */
export function mergeMessages(a: RoomMessage[], b: RoomMessage[], limit: number): RoomMessage[] {
  const map = new Map<string, RoomMessage>();
  for (const m of [...a, ...b]) map.set(m.id, m);
  return [...map.values()].sort((x, y) => y.createdAt - x.createdAt).slice(0, limit);
}
