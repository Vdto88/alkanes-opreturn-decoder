import { describe, it, expect } from 'vitest';
import { detectBurn } from './burn';

describe('detectBurn', () => {
  it('flags burn when pointer hits the OP_RETURN vout (fixture)', () => {
    const v = detectBurn({ pointer: 1, refund: 0 }, 1);
    expect(v.burned).toBe(true);
    expect(v.reason).toContain('pointer');
    expect(v.reason).toContain('vout 1');
  });

  it('no burn when pointer/refund avoid the OP_RETURN vout', () => {
    expect(detectBurn({ pointer: 0, refund: 2 }, 1)).toEqual({ burned: false });
  });

  it('is undetermined without a known OP_RETURN vout', () => {
    const v = detectBurn({ pointer: 1 }, undefined);
    expect(v.burned).toBe(false);
    expect(v.undetermined).toBe(true);
    expect(v.reason).toContain('OP_RETURN');
  });

  it('mentions both pointer and refund when both hit the OP_RETURN vout', () => {
    const v = detectBurn({ pointer: 1, refund: 1 }, 1);
    expect(v.burned).toBe(true);
    expect(v.reason).toContain('pointer');
    expect(v.reason).toContain('refund');
  });
});
