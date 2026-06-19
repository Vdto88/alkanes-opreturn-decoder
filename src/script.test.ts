import { describe, it, expect } from 'vitest';
import { bytesToHex } from './hex';
import { parseOpReturn } from './script';

const OP_RETURN_HEX = '6a5d1aff7f8196ec8ad08bc0a882edebb78a92908002ff7f9fb5939010';

describe('parseOpReturn', () => {
  it('extracts the 26-byte runestone payload from the fixture', () => {
    const payload = parseOpReturn(OP_RETURN_HEX);
    expect(payload.length).toBe(26);
    expect(bytesToHex(payload)).toBe('ff7f8196ec8ad08bc0a882edebb78a92908002ff7f9fb5939010');
  });

  it('rejects a non-OP_RETURN script', () => {
    expect(() => parseOpReturn('512066535cb5')).toThrow();
  });

  it('rejects an OP_RETURN without the OP_13 magic', () => {
    expect(() => parseOpReturn('6a04deadbeef')).toThrow();
  });

  it('rejects a push that runs past the end of the script', () => {
    // OP_RETURN OP_13 then a push claiming 10 bytes but only 2 provided
    expect(() => parseOpReturn('6a5d0aff7f')).toThrow();
  });
});
