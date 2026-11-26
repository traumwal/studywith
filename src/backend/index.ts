import type { Backend } from './types';

export type { Backend, SignInMethod, LocalAccount } from './types';

export function firebaseConfig() {
  const env = import.meta.env;
  if (!env.VITE_FIREBASE_API_KEY || !env.VITE_FIREBASE_PROJECT_ID) return null;
  return {
    apiKey: env.VITE_FIREBASE_API_KEY as string,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN as string,
    projectId: env.VITE_FIREBASE_PROJECT_ID as string,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET as string,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID as string,
    appId: env.VITE_FIREBASE_APP_ID as string,
  };
}

/** Firebase の設定があれば Firebase、なければローカルモードを使う */
export async function createBackend(): Promise<Backend> {
  const config = firebaseConfig();
  if (config) {
    const { FirebaseBackend } = await import('./firebase');
    return new FirebaseBackend(config);
  }
  const { LocalBackend } = await import('./local');
  return new LocalBackend();
}
