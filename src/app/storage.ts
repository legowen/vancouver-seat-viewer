type StorageKind = 'local' | 'session';

// Storage access can throw (private mode, blocked cookies, sandboxed frames), so every
// call is wrapped and the app works without persistence when it does.
function storage(kind: StorageKind): Storage {
  return kind === 'local' ? window.localStorage : window.sessionStorage;
}

export function safeStorageGet(key: string, kind: StorageKind = 'local'): string | null {
  try {
    return storage(kind).getItem(key);
  } catch {
    return null;
  }
}

export function safeStorageSet(key: string, value: string, kind: StorageKind = 'local'): boolean {
  try {
    storage(kind).setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function safeStorageRemove(key: string, kind: StorageKind = 'local'): void {
  try {
    storage(kind).removeItem(key);
  } catch {
    // Nothing to clean up if storage is unavailable.
  }
}
