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
import { arrayRemove, arrayUnion, collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';

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
    await assertSucceeds(getDoc(doc(db('carol'), 'rooms/ROOM01')));
    await assertSucceeds(updateDoc(doc(db('carol'), 'rooms/ROOM01'), { memberIds: arrayUnion('carol') }));
  });

  it('他人を追加・削除したり、名前を書き換えたりはできない', async () => {
    await assertFails(updateDoc(doc(db('carol'), 'rooms/ROOM01'), { memberIds: arrayUnion('dave') }));
    await assertFails(updateDoc(doc(db('alice'), 'rooms/ROOM01'), { memberIds: arrayRemove('bob') }));
    await assertFails(updateDoc(doc(db('alice'), 'rooms/ROOM01'), { name: '乗っ取り' }));
  });

  it('自分は退出できる', async () => {
    await assertSucceeds(updateDoc(doc(db('alice'), 'rooms/ROOM01'), { memberIds: arrayRemove('alice') }));
  });

  it('8人を超えては参加できない', async () => {
    await env.withSecurityRulesDisabled((ctx) =>
      setDoc(doc(ctx.firestore(), 'rooms/FULL01'), { name: 'a', createdAt: 1, memberIds: ['1', '2', '3', '4', '5', '6', '7', '8'] }),
    );
    await assertFails(updateDoc(doc(db('carol'), 'rooms/FULL01'), { memberIds: arrayUnion('carol') }));
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
