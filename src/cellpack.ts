import { decipher } from './leb128';
import type { RuneId } from './protostone';

export interface Cellpack {
  target: RuneId;
  opcode: bigint;
  inputs: bigint[];
  /** real inputs AFTER the opcode (inputs[0]), with trailing 15-byte-alignment padding zeros removed */
  cleanInputs: bigint[];
  raw: bigint[];
}

/** Decode a protostone message into a cellpack. Wire format is LEB128 of
 *  [block, tx, ...inputs]; opcode = inputs[0] by convention. The message is
 *  interpreted as LEB128 of [block, tx, ...inputs] (NOT a fixed 16-byte-per-u128
 *  layout) — this matches alkanes-rs and is verified by the burned-bond fixture
 *  and the espo oracle. The message is 15-byte-segment padded, so trailing-zero
 *  inputs are alignment padding. */
export function decodeCellpack(message: Uint8Array): Cellpack {
  const raw = decipher(message);
  if (raw.length < 2) throw new Error('cellpack too short (no target block:tx)');

  const target: RuneId = { block: raw[0], tx: raw[1] };
  const inputs = raw.slice(2);
  const opcode = inputs.length > 0 ? inputs[0] : 0n;

  // cleanInputs: remove opcode (inputs[0]), then trim trailing zeros
  const withoutOpcode = inputs.slice(1);
  let end = withoutOpcode.length;
  while (end > 0 && withoutOpcode[end - 1] === 0n) end--;
  const cleanInputs = withoutOpcode.slice(0, end);

  return { target, opcode, inputs, cleanInputs, raw };
}
