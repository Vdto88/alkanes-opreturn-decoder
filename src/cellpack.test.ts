import { describe, it, expect } from 'vitest';
import { hexToBytes } from './hex';
import { decodeCellpack } from './cellpack';

describe('decodeCellpack', () => {
  it('decodes the fixture message, trimming 15-byte padding', () => {
    const cp = decodeCellpack(hexToBytes('02bbde040102000000000000000000'));
    expect(cp.target).toEqual({ block: 2n, tx: 77627n });
    expect(cp.opcode).toBe(1n);
    expect(cp.cleanInputs).toEqual([2n]);
    // raw still matches the literal alkanes-rs decode (with padding zeros)
    expect(cp.raw).toEqual([2n, 77627n, 1n, 2n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n]);
    expect(cp.inputs).toEqual([1n, 2n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n]);
  });

  it('throws on a message too short to hold a target', () => {
    expect(() => decodeCellpack(hexToBytes('02'))).toThrow();
  });
});
