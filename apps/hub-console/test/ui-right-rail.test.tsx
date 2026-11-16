import { describe, expect, test } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { LanguageProvider } from '../src/i18n';
import { RightRail } from '../src/shared/ui/RightRail';
import {
  createRightRailStore,
  readRightRailOpen,
  RIGHT_RAIL_KEY,
  saveRightRailOpen,
} from '../src/shared/ui/right-rail-store';
import { resolveRailAvailable } from '../src/shared/ui/useRightRail';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  };
}

describe('right rail store', () => {
  test('defaults closed, toggles open and persists intent', () => {
    const storage = memoryStorage();
    const store = createRightRailStore(storage);
    expect(store.getSnapshot()).toBe(false);
    store.toggle();
    expect(store.getSnapshot()).toBe(true);
    expect(storage.values.get(RIGHT_RAIL_KEY)).toBe('true');
    expect(readRightRailOpen(storage)).toBe(true);
  });

  test('round-trips explicit false and rejects unknown values', () => {
    const storage = memoryStorage();
    saveRightRailOpen(false, storage);
    expect(readRightRailOpen(storage)).toBe(false);
    storage.values.set(RIGHT_RAIL_KEY, 'unexpected');
    expect(readRightRailOpen(storage)).toBeNull();
  });

  test('storage failures never break in-memory operation', () => {
    const storage = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
    };
    expect(readRightRailOpen(storage)).toBeNull();
    expect(() => saveRightRailOpen(true, storage)).not.toThrow();
    const store = createRightRailStore(storage);
    expect(() => store.setOpen(true)).not.toThrow();
    expect(store.getSnapshot()).toBe(true);
  });
});

describe('right rail viewport', () => {
  test('uses the 1200px availability boundary', () => {
    expect(resolveRailAvailable(1199)).toBe(false);
    expect(resolveRailAvailable(1200)).toBe(true);
  });
});

describe('RightRail markup', () => {
  test('exposes an open complementary landmark', () => {
    const html = renderToStaticMarkup(<LanguageProvider><RightRail open title="详情" onClose={() => {}} /></LanguageProvider>);
    expect(html).toContain('id="console-right-rail"');
    expect(html).toContain('aria-hidden="false"');
    expect(html).toContain('aria-labelledby="console-right-rail-title"');
  });

  test('hides a closed rail from assistive technology', () => {
    const html = renderToStaticMarkup(<LanguageProvider><RightRail open={false} title="详情" onClose={() => {}} /></LanguageProvider>);
    expect(html).toContain('aria-hidden="true"');
  });
});
