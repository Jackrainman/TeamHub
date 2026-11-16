import { useCallback, useSyncExternalStore } from 'react';
import { rightRailStore } from './right-rail-store';

export const RAIL_MEDIA_QUERY = '(max-width: 1199.98px)';

export function resolveRailAvailable(viewportWidth: number): boolean {
  return viewportWidth >= 1200;
}

function subscribeToViewport(listener: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const media = window.matchMedia(RAIL_MEDIA_QUERY);
  media.addEventListener('change', listener);
  return () => media.removeEventListener('change', listener);
}

function readViewport(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return true;
  return !window.matchMedia(RAIL_MEDIA_QUERY).matches;
}

export interface RightRailApi {
  open: boolean;
  available: boolean;
  isOpen: boolean;
  toggle(): void;
  show(): void;
  close(): void;
}

export function useRightRail(): RightRailApi {
  const open = useSyncExternalStore(rightRailStore.subscribe, rightRailStore.getSnapshot, () => false);
  const available = useSyncExternalStore(subscribeToViewport, readViewport, () => true);
  const toggle = useCallback(() => rightRailStore.toggle(), []);
  const show = useCallback(() => rightRailStore.setOpen(true), []);
  const close = useCallback(() => rightRailStore.setOpen(false), []);
  return { open, available, isOpen: open && available, toggle, show, close };
}
