import { describe, it, expect } from 'vitest';
import { hexToBytes, bytesToHex } from './hex';
import { encodeVarInt, readVarInt, decipher, splitBytes, joinToBytes } from './leb128';

describe('leb128', () => {
  it('encodeVarInt matches known runestone values', () => {
    expect(bytesToHex(encodeVarInt(16383n))).toBe('ff7f'); // PROTOCOL tag
    expect(bytesToHex(encodeVarInt(77627n))).toBe('bbde04'); // cellpack tx
    expect(bytesToHex(encodeVarInt(2n))).toBe('02');
  });

  it('readVarInt returns value and bytes consumed', () => {
    expect(readVarInt(hexToBytes('ff7f'), 0)).toEqual([16383n, 2]);
    expect(readVarInt(hexToBytes('bbde04'), 0)).toEqual([77627n, 3]);
  });

  it('decipher decodes the fixture cellpack message (with padding zeros)', () => {
    const out = decipher(hexToBytes('02bbde040102000000000000000000'));
    expect(out).toEqual([2n, 77627n, 1n, 2n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n]);
  });

  it('splitBytes/joinToBytes round-trip on 15-byte boundaries', () => {
    const bytes = hexToBytes('02bbde040102000000000000000000'); // 15 bytes
    const ints = splitBytes(bytes);
    expect(ints.length).toBe(1);
    expect(bytesToHex(joinToBytes(ints))).toBe('02bbde040102000000000000000000');
  });

  it('encodeVarInt rejects negative input', () => {
    expect(() => encodeVarInt(-1n)).toThrow();
  });
});
