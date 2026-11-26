import { DEFAULT_AVATAR, DEFAULT_CATEGORIES } from '../constants';
import type { UserProfile } from '../types';

export function newProfile(uid: string, displayName: string): UserProfile {
  return { uid, displayName, avatar: { ...DEFAULT_AVATAR }, categories: [...DEFAULT_CATEGORIES] };
}
