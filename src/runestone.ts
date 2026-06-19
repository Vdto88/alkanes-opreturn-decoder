import { decipher } from './leb128';

const TAG_BODY = 0n;
const TAG_POINTER = 22n; // Rune-level pointer
const TAG_PROTOCOL = 16383n; // 2^14 - 1

export interface RunestoneFields {
  protocolValues: bigint[];
  pointer?: number;
}

/** Decode a runestone payload (already extracted from the OP_RETURN script)
 *  into its tag/value fields, collecting the repeated PROTOCOL field. */
export function decodeRunestone(payload: Uint8Array): RunestoneFields {
  const ints = decipher(payload);
  const protocolValues: bigint[] = [];
  let pointer: number | undefined;

  for (let i = 0; i + 1 < ints.length; i += 2) {
    const tag = ints[i];
    if (tag === TAG_BODY) break; // remaining are rune-level edicts (ignored in v1)
    const value = ints[i + 1];
    if (tag === TAG_PROTOCOL) protocolValues.push(value);
    else if (tag === TAG_POINTER) pointer = Number(value);
    // other rune tags ignored for v1
  }

  return { protocolValues, pointer };
}
