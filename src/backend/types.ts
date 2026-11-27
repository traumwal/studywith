import type { AuthUser, Presence, Room, RoomMessage, StudySession, TimelineEntry, Unsubscribe, UserProfile } from '../types';

export type SignInMethod = 'google' | 'guest' | 'local';

export interface LocalAccount {
  uid: string;
  displayName: string;
}

/**
 * 保存先の違い（Firebase / このブラウザだけのローカル保存）を吸収する窓口。
 * UI はこのインターフェースだけを使う。
 */
export interface Backend {
  kind: 'firebase' | 'local';
  signInMethods: SignInMethod[];

  onAuthChange(cb: (user: AuthUser | null) => void): Unsubscribe;
  signIn(method: SignInMethod, opts?: { uid?: string; displayName?: string }): Promise<void>;
  signOut(): Promise<void>;
  /** ローカルモード用：このブラウザにある利用者一覧 */
  listLocalAccounts?(): LocalAccount[];

  getProfile(uid: string): Promise<UserProfile | null>;
  saveProfile(profile: UserProfile): Promise<void>;

  createRoom(uid: string, name: string): Promise<string>;
  /** 招待コードで参加。見つからない・満員のときは Error を投げる */
  joinRoom(uid: string, code: string): Promise<void>;
  leaveRoom(uid: string, roomId: string): Promise<void>;
  watchMyRooms(uid: string, cb: (rooms: Room[]) => void): Unsubscribe;

  watchPresence(roomId: string, cb: (list: Presence[]) => void): Unsubscribe;
  setPresence(roomId: string, presence: Presence): Promise<void>;

  /** スタンプ・自動メッセージを部屋に送る */
  sendMessage(roomId: string, message: Omit<RoomMessage, 'id'>): Promise<void>;
  /** createdAt が since より後のメッセージを古い順で購読する */
  watchMessages(roomId: string, since: number, cb: (list: RoomMessage[]) => void): Unsubscribe;
  /** LOG 用：新しい順に limit 件 */
  listMessages(roomId: string, limit: number): Promise<RoomMessage[]>;

  /** 記録を保存して、その id を返す */
  addSession(uid: string, session: Omit<StudySession, 'id'>): Promise<string>;
  deleteSession(uid: string, sessionId: string): Promise<void>;
  /** タイムラインに共有コピーを置く（id は元の記録と同じ。2 日後に消える） */
  addTimeline(roomId: string, entry: TimelineEntry): Promise<void>;
  deleteTimeline(roomId: string, id: string): Promise<void>;
  /** endedAt が since より後のタイムラインを購読する（2 日より前のものは含めない） */
  watchTimeline(roomId: string, since: number, cb: (list: TimelineEntry[]) => void): Unsubscribe;

  /** startedAt が [from, to) の記録を新しい順で */
  listSessions(uid: string, from: number, to: number): Promise<StudySession[]>;
}
