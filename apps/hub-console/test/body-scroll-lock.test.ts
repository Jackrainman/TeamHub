import { describe, expect, it } from 'vitest';
import { acquireBodyScrollLock } from '../src/shared/lib/body-scroll-lock';

describe('body scroll lock', () => {
  it('locks on open, supports nested drawers, and restores the previous inline value once', () => {
    const body = { style: { overflow: 'scroll' } } as HTMLElement;

    const releaseFirst = acquireBodyScrollLock(body);
    const releaseSecond = acquireBodyScrollLock(body);
    expect(body.style.overflow).toBe('hidden');

    releaseFirst();
    expect(body.style.overflow).toBe('hidden');
    releaseSecond();
    expect(body.style.overflow).toBe('scroll');
  });

  it('makes each release idempotent', () => {
    const body = { style: { overflow: '' } } as HTMLElement;
    const release = acquireBodyScrollLock(body);

    release();
    release();
    expect(body.style.overflow).toBe('');

    const nextRelease = acquireBodyScrollLock(body);
    expect(body.style.overflow).toBe('hidden');
    nextRelease();
    expect(body.style.overflow).toBe('');
  });
});
