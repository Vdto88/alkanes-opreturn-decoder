import { joinToBytes, decipher } from './leb128';

export interface RuneId {
  block: bigint;
  tx: bigint;
}

export interface ProtostoneEdict {
  id: RuneId;
  amount: bigint;
  output: bigint;
}

export interface Protostone {
  protocolTag: bigint;
  pointer?: number;
  refund?: number;
  burn?: bigint;
  from?: number;
  message: Uint8Array;
  edicts: ProtostoneEdict[];
}

const T_BODY = 0n;
const T_MESSAGE = 81n;
const T_BURN = 83n;
const T_POINTER = 91n;
const T_REFUND = 93n;
const T_FROM = 95n;

/** Delta-decode the next edict id (Rust next_protostone_edict_id). */
function nextEdictId(last: RuneId, block: bigint, tx: bigint): RuneId {
  return {
    block: last.block + block,
    tx: block === 0n ? last.tx + tx : tx,
  };
}

function decodeProtostoneEdicts(body: bigint[]): ProtostoneEdict[] {
  const out: ProtostoneEdict[] = [];
  let last: RuneId = { block: 0n, tx: 0n };
  for (let i = 0; i + 4 <= body.length; i += 4) {
    const id = nextEdictId(last, body[i], body[i + 1]);
    out.push({ id, amount: body[i + 2], output: body[i + 3] });
    last = id;
  }
  return out;
}

/** Group a flat [tag, value, tag, value, ...] list into a map keyed by tag.
 *  Tag 0 (BODY) consumes all remaining values. (Rust to_fields.) */
function toFields(values: bigint[]): Map<bigint, bigint[]> {
  const map = new Map<bigint, bigint[]>();
  let i = 0;
  while (i + 1 < values.length || (i < values.length && values[i] === T_BODY)) {
    const key = values[i++];
    if (key === T_BODY) {
      const rest = values.slice(i);
      map.set(T_BODY, (map.get(T_BODY) ?? []).concat(rest));
      break;
    }
    if (i >= values.length) break;
    const value = values[i++];
    map.set(key, (map.get(key) ?? []).concat([value]));
  }
  return map;
}

function fromFieldsAndTag(fields: Map<bigint, bigint[]>, protocolTag: bigint): Protostone {
  const first = (tag: bigint): bigint | undefined => fields.get(tag)?.[0];
  const messageValues = fields.get(T_MESSAGE) ?? [];
  return {
    protocolTag,
    pointer: first(T_POINTER) !== undefined ? Number(first(T_POINTER)) : undefined,
    refund: first(T_REFUND) !== undefined ? Number(first(T_REFUND)) : undefined,
    burn: first(T_BURN),
    from: first(T_FROM) !== undefined ? Number(first(T_FROM)) : undefined,
    message: joinToBytes(messageValues),
    edicts: decodeProtostoneEdicts(fields.get(T_BODY) ?? []),
  };
}

/** Port of Protostone::decipher (protorune-support/src/protostone.rs). */
export function decipherProtostones(protocolValues: bigint[]): Protostone[] {
  const stream = decipher(joinToBytes(protocolValues));
  const out: Protostone[] = [];
  let i = 0;
  while (i < stream.length) {
    const protocolTag = stream[i++];
    if (protocolTag === 0n) break; // trailing zero padding
    if (i >= stream.length) break;
    const length = Number(stream[i++]);
    const fieldInts = stream.slice(i, i + length);
    if (fieldInts.length < length) break; // fewer values than expected
    i += length;
    out.push(fromFieldsAndTag(toFields(fieldInts), protocolTag));
  }
  return out;
}
