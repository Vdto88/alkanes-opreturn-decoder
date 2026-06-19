import { hexToBytes, bytesToHex } from './hex';

export interface TxOutput {
  value: bigint;
  scriptHex: string;
}

/** Bitcoin compact-size (varint). Returns [value, bytesConsumed]. */
function readCompact(buf: Uint8Array, pos: number): [bigint, number] {
  const first = buf[pos];
  if (first < 0xfd) return [BigInt(first), 1];
  if (first === 0xfd) return [BigInt(buf[pos + 1] | (buf[pos + 2] << 8)), 3];
  if (first === 0xfe) {
    let v = 0n;
    for (let i = 0; i < 4; i++) v |= BigInt(buf[pos + 1 + i]) << BigInt(8 * i);
    return [v, 5];
  }
  let v = 0n;
  for (let i = 0; i < 8; i++) v |= BigInt(buf[pos + 1 + i]) << BigInt(8 * i);
  return [v, 9];
}

function readU64LE(buf: Uint8Array, pos: number): bigint {
  let v = 0n;
  for (let i = 0; i < 8; i++) v |= BigInt(buf[pos + i]) << BigInt(8 * i);
  return v;
}

/** Parse a raw Bitcoin transaction and return its outputs. Segwit-aware;
 *  stops after outputs (witness/locktime not needed). */
export function parseTxOutputs(rawHex: string): TxOutput[] {
  const buf = hexToBytes(rawHex);
  let p = 4; // skip version
  if (buf[p] === 0x00) p += 2; // segwit marker (0x00) + flag (0x01)

  const [vinCount, n1] = readCompact(buf, p);
  p += n1;
  for (let i = 0n; i < vinCount; i++) {
    p += 36; // prev txid (32) + prev vout (4)
    const [scriptLen, ns] = readCompact(buf, p);
    p += ns + Number(scriptLen);
    p += 4; // sequence
  }

  const [voutCount, n2] = readCompact(buf, p);
  p += n2;
  const outs: TxOutput[] = [];
  for (let i = 0n; i < voutCount; i++) {
    const value = readU64LE(buf, p);
    p += 8;
    const [scriptLen, ns] = readCompact(buf, p);
    p += ns;
    const scriptHex = bytesToHex(buf.subarray(p, p + Number(scriptLen)));
    p += Number(scriptLen);
    outs.push({ value, scriptHex });
  }
  return outs;
}

/** Find the index of the first Runestone OP_RETURN output (`6a5d` prefix).
 *  Returns -1 if no Runestone OP_RETURN is found. */
export function findOpReturnVout(outputs: TxOutput[]): number {
  return outputs.findIndex((o) => o.scriptHex.startsWith('6a5d'));
}
