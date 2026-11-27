import { MAX_ROOM_MEMBERS, TIMELINE_KEEP_MS } from '../constants';
import { generateRoomCode, normalizeRoomCode } from '../lib/code';
import type { AuthUser, Presence, Room, RoomMessage, StudySession, TimelineEntry, Unsubscribe, UserProfile } from '../types';
import type { Backend, LocalAccount, SignInMethod } from './types';

/**
 * ローカルモード：サーバーなしで、このブラウザの localStorage にだけ保存する。
 * ログイン中の利用者はタブごと（sessionStorage）なので、
 * 2つのタブで別の名前で入ると「友達がいる部屋」を1台で試せる。
 */
const PREFIX = 'studyroom:v1:';
const SESSION_UID_KEY = PREFIX + 'currentUid';

interface Db {
  users: Record<string, UserProfile>;
  accounts: LocalAccount[];
  rooms: Record<string, Room>;
  presence: Record<string, Record<string, Presence>>;
  messages: Record<string, RoomMessage[]>;
  timeline: Record<string, Record<string, TimelineEntry>>;
  sessions: Record<string, StudySession[]>;
}

/** ローカルモードで部屋ごとに残すメッセージの数（localStorage を使い切らないように） */
const LOCAL_MESSAGE_KEEP = 200;

type Key = keyof Db;

function read<K extends Key>(key: K, fallback: Db[K]): Db[K] {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as Db[K]) : fallback;
  } catch {
    return fallback;
  }
}

export class LocalBackend implements Backend {
  kind = 'local' as const;
  signInMethods: SignInMethod[] = ['local'];

  private listeners = new Map<Key, Set<() => void>>();
  private authListeners = new Set<(u: AuthUser | null) => void>();

  constructor() {
    window.addEventListener('storage', (e) => {
      if (!e.key?.startsWith(PREFIX)) return;
      this.emit(e.key.slice(PREFIX.length) as Key);
    });
  }

  private write<K extends Key>(key: K, value: Db[K]) {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
    this.emit(key);
  }

  private emit(key: Key) {
    this.listeners.get(key)?.forEach((fn) => fn());
  }

  private subscribe(key: Key, fn: () => void): Unsubscribe {
    if (!this.listeners.has(key)) this.listeners.set(key, new Set());
    this.listeners.get(key)!.add(fn);
    fn();
    return () => this.listeners.get(key)?.delete(fn);
  }

  private currentUser(): AuthUser | null {
    const uid = sessionStorage.getItem(SESSION_UID_KEY);
    if (!uid) return null;
    const account = read('accounts', []).find((a) => a.uid === uid);
    return account ? { uid, suggestedName: account.displayName } : null;
  }

  onAuthChange(cb: (user: AuthUser | null) => void): Unsubscribe {
    this.authListeners.add(cb);
    queueMicrotask(() => cb(this.currentUser()));
    return () => this.authListeners.delete(cb);
  }

  listLocalAccounts(): LocalAccount[] {
    return read('accounts', []);
  }

  async signIn(_method: SignInMethod, opts?: { uid?: string; displayName?: string }) {
    const accounts = read('accounts', []);
    let uid = opts?.uid;
    if (!uid || !accounts.some((a) => a.uid === uid)) {
      const displayName = opts?.displayName?.trim() || 'ゲスト';
      uid = 'local-' + crypto.randomUUID();
      this.write('accounts', [...accounts, { uid, displayName }]);
    }
    sessionStorage.setItem(SESSION_UID_KEY, uid);
    const user = this.currentUser();
    this.authListeners.forEach((fn) => fn(user));
  }

  async signOut() {
    sessionStorage.removeItem(SESSION_UID_KEY);
    this.authListeners.forEach((fn) => fn(null));
  }

  async getProfile(uid: string) {
    return read('users', {})[uid] ?? null;
  }

  async saveProfile(profile: UserProfile) {
    this.write('users', { ...read('users', {}), [profile.uid]: profile });
    const accounts = read('accounts', []).map((a) =>
      a.uid === profile.uid ? { ...a, displayName: profile.displayName } : a,
    );
    this.write('accounts', accounts);
  }

  async createRoom(uid: string, name: string) {
    const rooms = read('rooms', {});
    let id = generateRoomCode();
    while (rooms[id]) id = generateRoomCode();
    rooms[id] = { id, name, createdAt: Date.now(), memberIds: [uid] };
    this.write('rooms', rooms);
    return id;
  }

  async joinRoom(uid: string, code: string) {
    const rooms = read('rooms', {});
    const room = rooms[normalizeRoomCode(code)];
    if (!room) throw new Error('その招待コードの部屋が見つかりません');
    if (room.memberIds.includes(uid)) return;
    if (room.memberIds.length >= MAX_ROOM_MEMBERS) throw new Error('この部屋は満員です');
    room.memberIds = [...room.memberIds, uid];
    this.write('rooms', rooms);
  }

  async leaveRoom(uid: string, roomId: string) {
    const rooms = read('rooms', {});
    const room = rooms[roomId];
    if (!room) return;
    room.memberIds = room.memberIds.filter((m) => m !== uid);
    if (room.memberIds.length === 0) delete rooms[roomId];
    this.write('rooms', rooms);
    const presence = read('presence', {});
    if (presence[roomId]) {
      delete presence[roomId][uid];
      this.write('presence', presence);
    }
  }

  watchMyRooms(uid: string, cb: (rooms: Room[]) => void): Unsubscribe {
    return this.subscribe('rooms', () => {
      const rooms = Object.values(read('rooms', {}))
        .filter((r) => r.memberIds.includes(uid))
        .sort((a, b) => a.createdAt - b.createdAt);
      cb(rooms);
    });
  }

  watchPresence(roomId: string, cb: (list: Presence[]) => void): Unsubscribe {
    return this.subscribe('presence', () => cb(Object.values(read('presence', {})[roomId] ?? {})));
  }

  async setPresence(roomId: string, presence: Presence) {
    const all = read('presence', {});
    all[roomId] = { ...(all[roomId] ?? {}), [presence.uid]: presence };
    this.write('presence', all);
  }

  async sendMessage(roomId: string, message: Omit<RoomMessage, 'id'>) {
    const all = read('messages', {});
    all[roomId] = [...(all[roomId] ?? []), { ...message, id: crypto.randomUUID() }].slice(-LOCAL_MESSAGE_KEEP);
    this.write('messages', all);
  }

  watchMessages(roomId: string, since: number, cb: (list: RoomMessage[]) => void): Unsubscribe {
    return this.subscribe('messages', () =>
      cb((read('messages', {})[roomId] ?? []).filter((m) => m.createdAt > since).sort((a, b) => a.createdAt - b.createdAt)),
    );
  }

  async listMessages(roomId: string, limit: number) {
    return [...(read('messages', {})[roomId] ?? [])].sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
  }

  async addSession(uid: string, session: Omit<StudySession, 'id'>) {
    const all = read('sessions', {});
    const id = crypto.randomUUID();
    all[uid] = [...(all[uid] ?? []), { ...session, id }];
    this.write('sessions', all);
    return id;
  }

  /** 2 日より前のタイムラインを捨てる（Firebase の TTL の代わり） */
  private freshTimeline() {
    const keepAfter = Date.now() - TIMELINE_KEEP_MS;
    const all = read('timeline', {});
    for (const room of Object.values(all)) {
      for (const [id, e] of Object.entries(room)) if (e.endedAt <= keepAfter) delete room[id];
    }
    return all;
  }

  async addTimeline(roomId: string, entry: TimelineEntry) {
    const all = this.freshTimeline();
    all[roomId] = { ...(all[roomId] ?? {}), [entry.id]: entry };
    this.write('timeline', all);
  }

  async deleteTimeline(roomId: string, id: string) {
    const all = this.freshTimeline();
    if (all[roomId]) delete all[roomId][id];
    this.write('timeline', all);
  }

  watchTimeline(roomId: string, since: number, cb: (list: TimelineEntry[]) => void): Unsubscribe {
    return this.subscribe('timeline', () =>
      cb(Object.values(this.freshTimeline()[roomId] ?? {}).filter((e) => e.endedAt > since)),
    );
  }

  async deleteSession(uid: string, sessionId: string) {
    const all = read('sessions', {});
    all[uid] = (all[uid] ?? []).filter((s) => s.id !== sessionId);
    this.write('sessions', all);
  }

  async listSessions(uid: string, from: number, to: number) {
    return (read('sessions', {})[uid] ?? [])
      .filter((s) => s.startedAt >= from && s.startedAt < to)
      .sort((a, b) => b.startedAt - a.startedAt);
  }
}
