import { initializeApp, type FirebaseOptions } from 'firebase/app';
import {
  GoogleAuthProvider,
  connectAuthEmulator,
  getAuth,
  onAuthStateChanged,
  signInAnonymously,
  signInWithPopup,
  signOut,
  type Auth,
} from 'firebase/auth';
import {
  arrayRemove,
  arrayUnion,
  collection,
  connectFirestoreEmulator,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
  addDoc,
  limit as limitTo,
  type Firestore,
} from 'firebase/firestore';
import { MAX_ROOM_MEMBERS } from '../constants';
import { generateRoomCode, normalizeRoomCode } from '../lib/code';
import type { AuthUser, Presence, Room, RoomMessage, StudySession, Unsubscribe, UserProfile } from '../types';
import type { Backend, SignInMethod } from './types';

/**
 * Firestore の構成（Firestore は「コレクション/ドキュメント」が交互になるため、
 * 仕様書の presence/{roomId}/{userId} は rooms/{roomId}/presence/{userId} に置く）
 *
 * rooms/{roomId}                       name, createdAt, memberIds[]   ※ roomId = 招待コード
 * rooms/{roomId}/presence/{uid}        status, category, startedAt, accumulatedSec, updatedAt, displayName, avatar
 * rooms/{roomId}/messages/{id}         senderId, kind, text, createdAt
 * users/{uid}                          displayName, avatar, categories, stamps, tone
 * users/{uid}/sessions/{sessionId}     category, startedAt, endedAt, durationSec, source
 */
export class FirebaseBackend implements Backend {
  kind = 'firebase' as const;
  signInMethods: SignInMethod[] = ['google', 'guest'];
  private auth: Auth;
  private db: Firestore;

  constructor(config: FirebaseOptions) {
    const app = initializeApp(config);
    this.auth = getAuth(app);
    this.db = getFirestore(app);
    // npm run emulators で起動したローカルの Firebase につなぐ（開発・テスト用）
    if (import.meta.env.VITE_FIREBASE_EMULATOR === 'true') {
      connectAuthEmulator(this.auth, 'http://127.0.0.1:9099', { disableWarnings: true });
      connectFirestoreEmulator(this.db, '127.0.0.1', 8080);
    }
  }

  onAuthChange(cb: (user: AuthUser | null) => void): Unsubscribe {
    return onAuthStateChanged(this.auth, (u) =>
      cb(u ? { uid: u.uid, suggestedName: u.displayName ?? undefined } : null),
    );
  }

  async signIn(method: SignInMethod) {
    if (method === 'google') await signInWithPopup(this.auth, new GoogleAuthProvider());
    else await signInAnonymously(this.auth);
  }

  async signOut() {
    await signOut(this.auth);
  }

  async getProfile(uid: string) {
    const snap = await getDoc(doc(this.db, 'users', uid));
    return snap.exists() ? ({ ...snap.data(), uid } as UserProfile) : null;
  }

  async saveProfile(profile: UserProfile) {
    const { uid, ...data } = profile;
    await setDoc(doc(this.db, 'users', uid), data);
  }

  async createRoom(uid: string, name: string) {
    // 招待コードをそのまま部屋IDにする。まれな重複に備えてトランザクションで確認
    for (let i = 0; i < 5; i++) {
      const id = generateRoomCode();
      const ref = doc(this.db, 'rooms', id);
      const created = await runTransaction(this.db, async (tx) => {
        const snap = await tx.get(ref);
        if (snap.exists()) return false;
        tx.set(ref, { name, createdAt: Date.now(), memberIds: [uid] });
        return true;
      });
      if (created) return id;
    }
    throw new Error('部屋を作成できませんでした。もう一度お試しください');
  }

  async joinRoom(uid: string, code: string) {
    const id = normalizeRoomCode(code);
    if (!id) throw new Error('招待コードを入力してください');
    const ref = doc(this.db, 'rooms', id);
    // トランザクションで「部屋がある・満員でない」を確かめてから自分を追加する
    // （ルール側でも「自分だけを追加」「最大人数」を検証している）
    await runTransaction(this.db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error('その招待コードの部屋が見つかりません');
      const members = (snap.data().memberIds ?? []) as string[];
      if (members.includes(uid)) return;
      if (members.length >= MAX_ROOM_MEMBERS) throw new Error(`この部屋は満員です（最大${MAX_ROOM_MEMBERS}人）`);
      tx.update(ref, { memberIds: arrayUnion(uid) });
    });
  }

  async leaveRoom(uid: string, roomId: string) {
    await deleteDoc(doc(this.db, 'rooms', roomId, 'presence', uid)).catch(() => {});
    await updateDoc(doc(this.db, 'rooms', roomId), { memberIds: arrayRemove(uid) });
  }

  watchMyRooms(uid: string, cb: (rooms: Room[]) => void): Unsubscribe {
    const q = query(collection(this.db, 'rooms'), where('memberIds', 'array-contains', uid));
    return onSnapshot(q, (snap) => {
      const rooms = snap.docs
        .map((d) => ({ ...(d.data() as Omit<Room, 'id'>), id: d.id }))
        .sort((a, b) => a.createdAt - b.createdAt);
      cb(rooms);
    });
  }

  watchPresence(roomId: string, cb: (list: Presence[]) => void): Unsubscribe {
    return onSnapshot(
      collection(this.db, 'rooms', roomId, 'presence'),
      (snap) => cb(snap.docs.map((d) => ({ ...(d.data() as Presence), uid: d.id }))),
      () => cb([]),
    );
  }

  async setPresence(roomId: string, presence: Presence) {
    await setDoc(doc(this.db, 'rooms', roomId, 'presence', presence.uid), presence);
  }

  async sendMessage(roomId: string, message: Omit<RoomMessage, 'id'>) {
    await addDoc(collection(this.db, 'rooms', roomId, 'messages'), message);
  }

  watchMessages(roomId: string, since: number, cb: (list: RoomMessage[]) => void): Unsubscribe {
    const q = query(collection(this.db, 'rooms', roomId, 'messages'), where('createdAt', '>', since), orderBy('createdAt'));
    return onSnapshot(
      q,
      (snap) => cb(snap.docs.map((d) => ({ ...(d.data() as Omit<RoomMessage, 'id'>), id: d.id }))),
      (e) => console.warn('messages', e),
    );
  }

  async listMessages(roomId: string, limit: number) {
    const q = query(collection(this.db, 'rooms', roomId, 'messages'), orderBy('createdAt', 'desc'), limitTo(limit));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ ...(d.data() as Omit<RoomMessage, 'id'>), id: d.id }));
  }

  async addSession(uid: string, session: Omit<StudySession, 'id'>) {
    await addDoc(collection(this.db, 'users', uid, 'sessions'), session);
  }

  async deleteSession(uid: string, sessionId: string) {
    await deleteDoc(doc(this.db, 'users', uid, 'sessions', sessionId));
  }

  async listSessions(uid: string, from: number, to: number) {
    const q = query(
      collection(this.db, 'users', uid, 'sessions'),
      where('startedAt', '>=', from),
      where('startedAt', '<', to),
      orderBy('startedAt', 'desc'),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ ...(d.data() as Omit<StudySession, 'id'>), id: d.id }));
  }
}
