export const RIGHT_RAIL_KEY = 'teamhub.rightRailOpen';
type RailStorage = Pick<Storage, 'getItem' | 'setItem'>;

function browserStorage(storage?: RailStorage | null): RailStorage | null {
  if (storage !== undefined) return storage;
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readRightRailOpen(storage?: RailStorage | null): boolean | null {
  try {
    const value = browserStorage(storage)?.getItem(RIGHT_RAIL_KEY);
    return value === 'true' ? true : value === 'false' ? false : null;
  } catch {
    return null;
  }
}

export function saveRightRailOpen(value: boolean, storage?: RailStorage | null): void {
  try {
    browserStorage(storage)?.setItem(RIGHT_RAIL_KEY, String(value));
  } catch {
    // Storage can be unavailable in private browsing; the in-memory state still works.
  }
}

export interface RightRailStore {
  getSnapshot(): boolean;
  subscribe(listener: () => void): () => void;
  setOpen(value: boolean): void;
  toggle(): void;
}

export function createRightRailStore(storage?: RailStorage | null): RightRailStore {
  let open = readRightRailOpen(storage) ?? false;
  const listeners = new Set<() => void>();
  const setOpen = (value: boolean) => {
    open = value;
    saveRightRailOpen(value, storage);
    listeners.forEach(listener => listener());
  };
  return {
    getSnapshot: () => open,
    subscribe: listener => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setOpen,
    toggle: () => setOpen(!open),
  };
}

export const rightRailStore: RightRailStore = createRightRailStore();
