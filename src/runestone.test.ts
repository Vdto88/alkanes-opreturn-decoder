import { describe, it, expect } from 'vitest';
import { parseOpReturn } from './script';
import { decodeRunestone } from './runestone';
import { decipher, joinToBytes } from './leb128';

const OP_RETURN_HEX = '6a5d1aff7f8196ec8ad08bc0a882edebb78a92908002ff7f9fb5939010';

describe('decodeRunestone', () => {
  it('collects two protocol-field values from the fixture', () => {
    const { protocolValues } = decodeRunestone(parseOpReturn(OP_RETURN_HEX));
    expect(protocolValues.length).toBe(2);
  });

  it('protocol field reassembles to a stream whose first protostone tag is 1', () => {
    const { protocolValues } = decodeRunestone(parseOpReturn(OP_RETURN_HEX));
    const stream = decipher(joinToBytes(protocolValues));
    // [protocol_tag, length, ...fields]; Alkanes protocol tag = 1
    expect(stream[0]).toBe(1n);
  });
});
