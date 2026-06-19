import { parseOpReturn } from './script';
import { parseTxOutputs, findOpReturnVout } from './tx';
import { decodeRunestone } from './runestone';
import { decipherProtostones, type Protostone } from './protostone';
import { decodeCellpack, type Cellpack } from './cellpack';
import { detectBurn, type BurnVerdict } from './burn';

const ALKANES_PROTOCOL_TAG = 1n;

export interface DecodedProtostone extends Protostone {
  isAlkanes: boolean;
  cellpack?: Cellpack;
  burn: BurnVerdict;
}

export interface DecodeResult {
  opReturnHex: string;
  opReturnVout?: number;
  runePointer?: number;
  protostones: DecodedProtostone[];
}

/** Decode from a raw OP_RETURN scriptPubKey hex. `opReturnVout` enables burn
 *  detection; omit it when the vout layout is unknown. */
export function decodeOpReturn(opReturnHex: string, opReturnVout?: number): DecodeResult {
  const payload = parseOpReturn(opReturnHex);
  const { protocolValues, pointer: runePointer } = decodeRunestone(payload);
  const stones = decipherProtostones(protocolValues);

  const protostones: DecodedProtostone[] = stones.map((s) => {
    const isAlkanes = s.protocolTag === ALKANES_PROTOCOL_TAG;
    const cellpack = s.message.length > 0 ? safeCellpack(s.message) : undefined;
    const burn = detectBurn({ pointer: s.pointer, refund: s.refund }, opReturnVout);
    return { ...s, isAlkanes, cellpack, burn };
  });

  return { opReturnHex, opReturnVout, runePointer, protostones };
}

function safeCellpack(message: Uint8Array): Cellpack | undefined {
  try {
    return decodeCellpack(message);
  } catch {
    return undefined;
  }
}

/** Decode from a full raw transaction hex (finds the OP_RETURN output). */
export function decodeRawTx(rawTxHex: string): DecodeResult {
  const outs = parseTxOutputs(rawTxHex);
  const vout = findOpReturnVout(outs);
  if (vout < 0) throw new Error('no OP_RETURN output in transaction');
  return decodeOpReturn(outs[vout].scriptHex, vout);
}
