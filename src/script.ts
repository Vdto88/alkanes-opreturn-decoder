import { hexToBytes } from './hex';

const OP_RETURN = 0x6a;
const OP_13 = 0x5d; // Runestone magic

/** Parse an OP_RETURN scriptPubKey, returning the concatenated runestone
 *  payload (all data pushes after `OP_RETURN OP_13`). */
export function parseOpReturn(scriptHex: string): Uint8Array {
  const buf = hexToBytes(scriptHex);
  if (buf[0] !== OP_RETURN) throw new Error('not an OP_RETURN script');
  if (buf[1] !== OP_13) throw new Error('not a Runestone (missing OP_13 magic)');

  const out: number[] = [];
  let pos = 2;
  while (pos < buf.length) {
    const op = buf[pos++];
    let len: number;
    if (op >= 0x01 && op <= 0x4b) {
      len = op;
    } else if (op === 0x4c) {
      len = buf[pos++];
    } else if (op === 0x4d) {
      len = buf[pos] | (buf[pos + 1] << 8);
      pos += 2;
    } else {
      throw new Error(`unexpected opcode 0x${op.toString(16)} in runestone`);
    }
    for (let i = 0; i < len; i++) out.push(buf[pos++]);
  }
  return Uint8Array.from(out);
}
