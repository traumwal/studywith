export type HairStyle = 'short' | 'long' | 'bun' | 'spiky';

export type DeskSetId = 'ash' | 'walnut' | 'white' | 'oak' | 'mortar';

export interface Avatar {
  hair: HairStyle;
  hairColor: string;
  outfitColor: string;
  skin: string;
  /** 机と椅子の色の組み合わせ（古いデータには無いので省略可。無ければ既定の組み合わせ） */
  desk?: DeskSetId;
}

/** 机（天板・フレーム）と椅子をセットにした色の組み合わせ */
export interface DeskSet {
  id: DeskSetId;
  label: string;
  /** 天板 */
  top: string;
  /** 脚などのスチールフレーム */
  frame: string;
  /** 椅子（ライトのシェードも同じ色） */
  chair: string;
  /** ライトのアーム */
  arm: string;
}

/** 自動メッセージの口調 */
export type Tone = 'plain' | 'cat' | 'casual' | 'genki';

export interface UserProfile {
  uid: string;
  displayName: string;
  avatar: Avatar;
  /** 自分が使う分野の一覧（初期値は DEFAULT_CATEGORIES） */
  categories: string[];
  /** スタンプのマイセット（無ければ DEFAULT_STAMPS） */
  stamps?: string[];
  /** 自動メッセージの口調（無ければ 'plain'） */
  tone?: Tone;
}

export interface AuthUser {
  uid: string;
  /** ログイン方法から得られた名前（あれば初期値に使う） */
  suggestedName?: string;
}

export interface Room {
  id: string;
  name: string;
  createdAt: number;
  memberIds: string[];
}

export type PresenceStatus = 'studying' | 'break' | 'away' | 'offline';

/** rooms/{roomId}/presence/{uid} に置く、リアルタイムで共有する短いデータ */
export interface Presence {
  uid: string;
  displayName: string;
  avatar: Avatar;
  status: PresenceStatus;
  category: string | null;
  /** 今の勉強区間の開始時刻（ms）。休憩中・離席中は null */
  startedAt: number | null;
  /** このセッションで、今の区間より前に勉強した秒数（休憩を除く） */
  accumulatedSec: number;
  updatedAt: number;
}

export interface StudySession {
  id: string;
  category: string;
  startedAt: number;
  endedAt: number;
  durationSec: number;
  source: 'manual' | 'camera';
  /** タイムラインにコピーした部屋（削除するときに一緒に消すため） */
  roomId?: string;
}

/** rooms/{roomId}/timeline/{id}：タイムライン用の共有コピー（id は元の記録と同じ。2 日で消える） */
export interface TimelineEntry {
  id: string;
  userId: string;
  category: string;
  startedAt: number;
  endedAt: number;
}

export type MessageKind = 'stamp' | 'auto-start' | 'auto-break' | 'auto-stop';

/** rooms/{roomId}/messages/{id}：部屋の中を流れるスタンプと自動メッセージ */
export interface RoomMessage {
  id: string;
  senderId: string;
  kind: MessageKind;
  /** 送った時点の文章（組み立て済み） */
  text: string;
  createdAt: number;
}

export type Unsubscribe = () => void;
