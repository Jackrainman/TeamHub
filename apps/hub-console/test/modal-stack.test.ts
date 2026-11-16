import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isTopModal, popModal, pushModal, resetModalStack } from '../src/shared/lib/modal-stack';

describe('modal stack', () => {
  beforeEach(() => resetModalStack());
  afterEach(() => resetModalStack());

  it('makes the most recently opened drawer topmost and restores the lower drawer after pop', () => {
    const a = Symbol('a');
    const b = Symbol('b');

    pushModal(a);
    pushModal(b);

    expect(isTopModal(a)).toBe(false);
    expect(isTopModal(b)).toBe(true);

    popModal(b);
    expect(isTopModal(a)).toBe(true);
    expect(isTopModal(b)).toBe(false);
  });

  it('hands Escape handling back to the lower drawer when the top drawer closes', () => {
    const lower = Symbol('lower');
    const top = Symbol('top');

    pushModal(lower);
    pushModal(top);
    expect(isTopModal(lower)).toBe(false);
    expect(isTopModal(top)).toBe(true);

    popModal(top);
    expect(isTopModal(lower)).toBe(true);
    expect(isTopModal(top)).toBe(false);
  });

  it('ignores duplicate pushes so one pop removes the drawer from the stack', () => {
    const a = Symbol('a');
    const b = Symbol('b');

    pushModal(a);
    pushModal(a);
    popModal(a);

    expect(isTopModal(a)).toBe(false);
    pushModal(b);
    expect(isTopModal(b)).toBe(true);
    expect(isTopModal(a)).toBe(false);
  });

  it('handles an empty stack and unknown ids safely', () => {
    const missing = Symbol('missing');

    expect(isTopModal(missing)).toBe(false);
    expect(() => popModal(missing)).not.toThrow();
    expect(isTopModal(missing)).toBe(false);
  });
});
