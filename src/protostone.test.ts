import { describe, it, expect } from 'vitest';
import { bytesToHex } from './hex';
import { parseOpReturn } from './script';
import { decodeRunestone } from './runestone';
import { decipherProtostones } from './protostone';

const OP_RETURN_HEX = '6a5d1aff7f8196ec8ad08bc0a882edebb78a92908002ff7f9fb5939010';

describe('decipherProtostones', () => {
  it('decodes the fixture protostone (pointer 1, refund 0, edict 2:77087)', () => {
    const { protocolValues } = decodeRunestone(parseOpReturn(OP_RETURN_HEX));
    const stones = decipherProtostones(protocolValues);

    expect(stones.length).toBe(1);
    const s = stones[0];
    expect(s.protocolTag).toBe(1n);
    expect(s.pointer).toBe(1);
    expect(s.refund).toBe(0);
    expect(s.edicts).toEqual([
      { id: { block: 2n, tx: 77087n }, amount: 2n, output: 1n },
    ]);
    expect(bytesToHex(s.message)).toBe('02bbde040102000000000000000000');
  });
});
