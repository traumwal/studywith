import type { AuthUser, Presence, Room, StudySession, Unsubscribe, UserProfile } from '../types';

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

  addSession(uid: string, session: Omit<StudySession, 'id'>): Promise<void>;
  deleteSession(uid: string, sessionId: string): Promise<void>;
  /** startedAt が [from, to) の記録を新しい順で */
  listSessions(uid: string, from: number, to: number): Promise<StudySession[]>;
}
