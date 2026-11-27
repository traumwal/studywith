/**
 * Firestore セキュリティルールのテスト。
 * 実行: npm run test:rules（Firestore エミュレーターを起動してテストする）
 */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { addDoc, arrayRemove, arrayUnion, collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';

let env: RulesTestEnvironment;
const db = (uid: string) => env.authenticatedContext(uid).firestore();

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-rules-test',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});
afterAll(() => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const f = ctx.firestore();
    await setDoc(doc(f, 'rooms/ROOM01'), { name: '部屋', createdAt: 1, memberIds: ['alice', 'bob'] });
    await setDoc(doc(f, 'rooms/SOLO01'), { name: '1人の部屋', createdAt: 1, memberIds: ['alice'] });
    await setDoc(doc(f, 'rooms/ROOM01/presence/bob'), { status: 'studying' });
    await setDoc(doc(f, 'users/bob/sessions/s1'), { category: 'TOEIC', durationSec: 60 });
  });
});

describe('rooms', () => {
  it('作成は自分だけをメンバーにした部屋のみ', async () => {
    await assertSucceeds(setDoc(doc(db('carol'), 'rooms/NEW001'), { name: 'a', createdAt: 1, memberIds: ['carol'] }));
    await assertFails(setDoc(doc(db('carol'), 'rooms/NEW002'), { name: 'a', createdAt: 1, memberIds: ['carol', 'dave'] }));
  });

  it('一覧はメンバーの部屋だけ取得できる', async () => {
    const q = (uid: string) => query(collection(db(uid), 'rooms'), where('memberIds', 'array-contains', uid));
    await assertSucceeds(getDocs(q('alice')));
    await assertFails(getDocs(collection(db('carol'), 'rooms')));
  });

  it('招待コードを知っていれば部屋を確認して参加できる', async () => {
    await assertSucceeds(getDoc(doc(db('carol'), 'rooms/SOLO01')));
    await assertSucceeds(updateDoc(doc(db('carol'), 'rooms/SOLO01'), { memberIds: arrayUnion('carol') }));
  });

  it('他人を追加・削除したり、名前を書き換えたりはできない', async () => {
    await assertFails(updateDoc(doc(db('carol'), 'rooms/ROOM01'), { memberIds: arrayUnion('dave') }));
    await assertFails(updateDoc(doc(db('alice'), 'rooms/ROOM01'), { memberIds: arrayRemove('bob') }));
    await assertFails(updateDoc(doc(db('alice'), 'rooms/ROOM01'), { name: '乗っ取り' }));
  });

  it('自分は退出できる', async () => {
    await assertSucceeds(updateDoc(doc(db('alice'), 'rooms/ROOM01'), { memberIds: arrayRemove('alice') }));
  });

  it('2人を超えては参加できない', async () => {
    await assertFails(updateDoc(doc(db('carol'), 'rooms/ROOM01'), { memberIds: arrayUnion('carol') }));
  });
});

describe('messages', () => {
  const msg = (senderId: string, extra: Record<string, unknown> = {}) => ({
    senderId,
    kind: 'stamp',
    text: 'おつかれ',
    createdAt: Date.now(),
    ...extra,
  });

  it('メンバーは自分の名前でだけ送れて、読める', async () => {
    await assertSucceeds(addDoc(collection(db('alice'), 'rooms/ROOM01/messages'), msg('alice')));
    await assertSucceeds(addDoc(collection(db('alice'), 'rooms/ROOM01/messages'), msg('alice', { kind: 'auto-stop', text: '英語 50分 終わった' })));
    await assertSucceeds(getDocs(collection(db('bob'), 'rooms/ROOM01/messages')));
    await assertFails(addDoc(collection(db('alice'), 'rooms/ROOM01/messages'), msg('bob')));
  });

  it('メンバー以外は読めず、送れない', async () => {
    await assertFails(getDocs(collection(db('carol'), 'rooms/ROOM01/messages')));
    await assertFails(addDoc(collection(db('carol'), 'rooms/ROOM01/messages'), msg('carol')));
  });

  it('文字数・種類・時刻・余分な項目を検証する', async () => {
    const add = (data: Record<string, unknown>) => addDoc(collection(db('alice'), 'rooms/ROOM01/messages'), data);
    await assertSucceeds(add(msg('alice', { text: 'あ'.repeat(40) })));
    await assertFails(add(msg('alice', { text: 'あ'.repeat(41) })));
    await assertFails(add(msg('alice', { text: '' })));
    await assertFails(add(msg('alice', { kind: 'chat' })));
    await assertFails(add(msg('alice', { createdAt: Date.now() - 10 * 60 * 1000 })));
    await assertFails(add(msg('alice', { extra: 1 })));
  });

  it('送ったものは変更・削除できない', async () => {
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'rooms/ROOM01/messages/m1'), msg('alice')));
    await assertFails(updateDoc(doc(db('alice'), 'rooms/ROOM01/messages/m1'), { text: '書き換え' }));
    await assertFails(deleteDoc(doc(db('alice'), 'rooms/ROOM01/messages/m1')));
  });
});

describe('presence', () => {
  it('メンバーだけが読める・自分の分だけ書ける', async () => {
    await assertSucceeds(getDocs(collection(db('alice'), 'rooms/ROOM01/presence')));
    await assertFails(getDocs(collection(db('carol'), 'rooms/ROOM01/presence')));
    await assertSucceeds(setDoc(doc(db('alice'), 'rooms/ROOM01/presence/alice'), { status: 'break' }));
    await assertFails(setDoc(doc(db('alice'), 'rooms/ROOM01/presence/bob'), { status: 'away' }));
    await assertFails(setDoc(doc(db('carol'), 'rooms/ROOM01/presence/carol'), { status: 'studying' }));
    await assertFails(deleteDoc(doc(db('alice'), 'rooms/ROOM01/presence/bob')));
  });
});

describe('users / sessions', () => {
  it('勉強記録は本人だけ', async () => {
    await assertSucceeds(getDocs(collection(db('bob'), 'users/bob/sessions')));
    await assertFails(getDocs(collection(db('alice'), 'users/bob/sessions')));
    await assertFails(setDoc(doc(db('alice'), 'users/bob/sessions/x'), { category: 'x' }));
  });

  it('プロフィールは本人だけ書ける', async () => {
    await assertSucceeds(setDoc(doc(db('alice'), 'users/alice'), { displayName: 'アリス' }));
    await assertFails(setDoc(doc(db('alice'), 'users/bob'), { displayName: 'なりすまし' }));
  });

  it('ログインしていなければ何も読めない', async () => {
    const anon = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anon, 'rooms/ROOM01')));
    await assertFails(getDoc(doc(anon, 'users/bob')));
  });
});
