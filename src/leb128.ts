// LEB128 varint + 15-byte segment packing, mirrored from
// alkanes-rs/ts-sdk/src/protostone/bytes.ts and crates/protorune-support
// (split_bytes / join_to_bytes). Pure offline.

export function encodeVarInt(value: bigint): Uint8Array {
  if (value < 0n) throw new Error('encodeVarInt: value must be non-negative');
  const out: number[] = [];
  while (value >> 7n > 0n) {
    out.push(Number(value & 0x7fn) | 0x80);
    value >>= 7n;
  }
  out.push(Number(value & 0x7fn));
  return Uint8Array.from(out);
}

/** Read one LEB128 varint at `pos`. Returns [value, bytesConsumed]. */
export function readVarInt(buf: Uint8Array, pos: number): [bigint, number] {
  let result = 0n;
  for (let i = 0; i <= 18; i++) {
    const byte = buf[pos + i];
    if (byte === undefined) throw new Error('unterminated varint');
    const v = BigInt(byte & 0x7f);
    if (i === 18 && (v & 0x7cn) !== 0n) throw new Error('varint overflow');
    result |= v << BigInt(7 * i);
    if ((byte & 0x80) === 0) return [result, i + 1];
  }
  throw new Error('overlong varint');
}

/** LEB128 buffer -> all integers. Stops cleanly on an incomplete trailing
 *  varint (matches alkanes-rs decipher returning -1 sentinel). */
export function decipher(buf: Uint8Array): bigint[] {
  const out: bigint[] = [];
  let pos = 0;
  while (pos < buf.length) {
    let value: bigint;
    let n: number;
    try {
      [value, n] = readVarInt(buf, pos);
    } catch {
      break;
    }
    out.push(value);
    pos += n;
  }
  return out;
}

/** bytes -> u128[] in 15-byte little-endian chunks (Rust split_bytes). */
export function splitBytes(buf: Uint8Array): bigint[] {
  const out: bigint[] = [];
  for (let i = 0; i < buf.length; i += 15) {
    const chunk = buf.subarray(i, i + 15);
    let v = 0n;
    for (let j = 0; j < chunk.length; j++) v |= BigInt(chunk[j]) << BigInt(8 * j);
    out.push(v);
  }
  return out;
}

/** u128[] -> bytes, 15 little-endian bytes per value (Rust join_to_bytes /
 *  snap_to_15_bytes). This re-introduces the alignment padding. */
export function joinToBytes(values: bigint[]): Uint8Array {
  const out: number[] = [];
  for (const value of values) {
    let v = value;
    for (let j = 0; j < 15; j++) {
      out.push(Number(v & 0xffn));
      v >>= 8n;
    }
  }
  return Uint8Array.from(out);
}
