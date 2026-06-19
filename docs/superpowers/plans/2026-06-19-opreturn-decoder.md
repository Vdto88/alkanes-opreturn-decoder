# Alkanes-aware OP_RETURN Decoder — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A TypeScript CLI + library that decodes a single Bitcoin transaction's OP_RETURN into its Runestone, Alkanes protostones, and cellpacks, with prominent burn detection.

**Architecture:** Pure-offline decode ported from `alkanes-rs` (`protorune-support/src/protostone.rs` + the LEB128/packing primitives in its `ts-sdk`). A small pipeline of single-responsibility modules: `leb128 → script → tx → runestone → protostone → cellpack`, plus `burn`, `decode` (orchestrator), `fetch` (the only network piece), `format`, `cli`. No `@alkanes/ts-sdk` dependency, no WASM, no custom registry.

**Tech Stack:** Node.js + TypeScript, vitest for tests, tsx for the CLI. Bitcoin tx parsing is hand-rolled (no bitcoinjs-lib).

## Global Constraints

- **Offline core:** `decode()` and all tests are pure parse — NO network. Only `fetch.ts` touches the network. Fixtures store raw hex offline.
- **No `@alkanes/ts-sdk` / custom registry:** port the logic; deps come from public npm only (`typescript`, `vitest`, `tsx`, `@types/node`).
- **Porting source (READ-only):** `C:\refs\alkanes-rs` rev `888f4fe6`. Canonical decode: `crates/protorune-support/src/protostone.rs`; primitives mirrored from `ts-sdk/src/protostone/bytes.ts`.
- **Runestone tag:** `PROTOCOL = 16383` (2^14−1); rune `POINTER = 22`; `BODY = 0`.
- **Protostone-internal tags:** `BODY = 0`, `MESSAGE = 81`, `BURN = 83`, `POINTER = 91`, `REFUND = 93`, `FROM = 95`.
- **Cellpack wire format:** LEB128 of `[block, tx, ...inputs]`; `target = [v0, v1]`, `inputs = v[2..]`, `opcode = inputs[0]` by convention. The message is 15-byte-segment padded, so trailing-zero inputs are alignment padding (trim for the "clean" view; keep raw to match alkanes-rs).
- **Burn rule:** burn ⟺ `pointer` (or `refund`) `==` the vout index of the OP_RETURN output.
- **Magic bytes:** OP_RETURN `0x6a`, Runestone magic OP_13 `0x5d`.
- **Env:** Windows + Git Bash. Use `git -C <path>`. No PowerShell heredoc. Run vitest via `npx vitest run <file>`.

### Fixture (real, mainnet) — used across tasks

- **txid:** `b9f28df473ed333f1b20359e8d25d29f8dee0e25004119e9b9fdc21f77e72f5e`
- **OP_RETURN at vout 1**, scriptPubKey hex:
  `6a5d1aff7f8196ec8ad08bc0a882edebb78a92908002ff7f9fb5939010`
- **Raw tx hex:**
  `020000000001026d47e28157914e7b60151c49271e4862a15195a4184c17f2f62bd71b0a7ceed60000000000fdffffff6d47e28157914e7b60151c49271e4862a15195a4184c17f2f62bd71b0a7ceed60200000000fdffffff03220200000000000022512066535cb55a5b0c2f4f622e82cac9e1fada1e8a1a7aa1c866589b5fcee3da909e00000000000000001d6a5d1aff7f8196ec8ad08bc0a882edebb78a92908002ff7f9fb5939010215300000000000022512066535cb55a5b0c2f4f622e82cac9e1fada1e8a1a7aa1c866589b5fcee3da909e01403d3b50dddc61eb68e4e173cd0231cc94bf28997fb7a717dbaf69006f0a34b36a3252920c2988910d4e7fc23d6f5b08088f167bfa377b54d1e13f54e093d8c2090140b4695841983c6819186b5cba3c8a55956471cb24f0ae955ee29e30414f20904fbf9dca3d63237f565d8805eb1e442aa97be171294a0d9e9f46d6237da7320bb900000000`
- **Expected decode (oracle: espo / mork1e):** 1 protostone — `protocolTag=1`, `pointer=1`, `refund=0`, edict `{id:2:77087, amount:2, output:1}`, `message_hex=02bbde040102000000000000000000`. Cellpack: `target=2:77627`, `opcode=1`, `cleanInputs=[2]`. **Burn fires** (pointer 1 → OP_RETURN vout 1).

---

### Task 1: Scaffold + LEB128 / packing primitives

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`
- Create: `src/hex.ts`
- Create: `src/leb128.ts`
- Test: `src/leb128.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `hex.ts`: `hexToBytes(hex: string): Uint8Array`, `bytesToHex(b: Uint8Array): string`
  - `leb128.ts`: `encodeVarInt(value: bigint): Uint8Array`, `readVarInt(buf: Uint8Array, pos: number): [bigint, number]`, `decipher(buf: Uint8Array): bigint[]`, `splitBytes(buf: Uint8Array): bigint[]`, `joinToBytes(values: bigint[]): Uint8Array`

- [ ] **Step 1: Scaffold the project**

`package.json`:
```json
{
  "name": "opreturn-decoder",
  "version": "0.1.0",
  "type": "module",
  "bin": { "opreturn-decode": "./dist/cli.js" },
  "scripts": {
    "test": "vitest run",
    "decode": "tsx src/cli.ts"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "tsx": "^4.0.0",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  }
}
```
`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "lib": ["ES2022"],
    "types": ["node"]
  },
  "include": ["src"]
}
```
`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['src/**/*.test.ts'] } });
```
`.gitignore`:
```
node_modules/
dist/
```
Then run: `npm install`

- [ ] **Step 2: Write the failing test**

`src/leb128.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { hexToBytes, bytesToHex } from './hex';
import { encodeVarInt, readVarInt, decipher, splitBytes, joinToBytes } from './leb128';

describe('leb128', () => {
  it('encodeVarInt matches known runestone values', () => {
    expect(bytesToHex(encodeVarInt(16383n))).toBe('ff7f'); // PROTOCOL tag
    expect(bytesToHex(encodeVarInt(77627n))).toBe('bbde04'); // cellpack tx
    expect(bytesToHex(encodeVarInt(2n))).toBe('02');
  });

  it('readVarInt returns value and bytes consumed', () => {
    expect(readVarInt(hexToBytes('ff7f'), 0)).toEqual([16383n, 2]);
    expect(readVarInt(hexToBytes('bbde04'), 0)).toEqual([77627n, 3]);
  });

  it('decipher decodes the fixture cellpack message (with padding zeros)', () => {
    const out = decipher(hexToBytes('02bbde040102000000000000000000'));
    expect(out).toEqual([2n, 77627n, 1n, 2n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n]);
  });

  it('splitBytes/joinToBytes round-trip on 15-byte boundaries', () => {
    const bytes = hexToBytes('02bbde040102000000000000000000'); // 15 bytes
    const ints = splitBytes(bytes);
    expect(ints.length).toBe(1);
    expect(bytesToHex(joinToBytes(ints))).toBe('02bbde040102000000000000000000');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/leb128.test.ts`
Expected: FAIL (modules `./hex`, `./leb128` not found).

- [ ] **Step 4: Implement `src/hex.ts`**

```ts
export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error('odd-length hex');
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function bytesToHex(b: Uint8Array): string {
  let s = '';
  for (const byte of b) s += byte.toString(16).padStart(2, '0');
  return s;
}
```

- [ ] **Step 5: Implement `src/leb128.ts`**

```ts
// LEB128 varint + 15-byte segment packing, mirrored from
// alkanes-rs/ts-sdk/src/protostone/bytes.ts and crates/protorune-support
// (split_bytes / join_to_bytes). Pure offline.

export function encodeVarInt(value: bigint): Uint8Array {
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
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/leb128.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 7: Commit**

```bash
git -C "C:/Alkanes Geral Dev/opreturn-decoder" add -A
git -C "C:/Alkanes Geral Dev/opreturn-decoder" commit -m "feat: scaffold + LEB128/packing primitives"
```

---

### Task 2: OP_RETURN script parser

**Files:**
- Create: `src/script.ts`
- Test: `src/script.test.ts`

**Interfaces:**
- Consumes: `hex.ts` (`hexToBytes`, `bytesToHex`).
- Produces: `parseOpReturn(scriptHex: string): Uint8Array` — returns the concatenated runestone payload (data pushes after `6a 5d`). Throws if not an OP_RETURN+OP_13 script.

- [ ] **Step 1: Write the failing test**

`src/script.test.ts`:
```ts
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/script.test.ts`
Expected: FAIL (module `./script` not found).

- [ ] **Step 3: Implement `src/script.ts`**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/script.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git -C "C:/Alkanes Geral Dev/opreturn-decoder" add -A
git -C "C:/Alkanes Geral Dev/opreturn-decoder" commit -m "feat: OP_RETURN script parser"
```

---

### Task 3: Bitcoin transaction output parser

**Files:**
- Create: `src/tx.ts`
- Test: `src/tx.test.ts`

**Interfaces:**
- Consumes: `hex.ts`.
- Produces:
  - `interface TxOutput { value: bigint; scriptHex: string; }`
  - `parseTxOutputs(rawHex: string): TxOutput[]` — segwit-aware; reads outputs only.
  - `findOpReturnVout(outputs: TxOutput[]): number` — index of the first output whose script starts with `6a`, or `-1`.

- [ ] **Step 1: Write the failing test**

`src/tx.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { parseTxOutputs, findOpReturnVout } from './tx';

const RAW_TX_HEX =
  '020000000001026d47e28157914e7b60151c49271e4862a15195a4184c17f2f62bd71b0a7ceed60000000000fdffffff6d47e28157914e7b60151c49271e4862a15195a4184c17f2f62bd71b0a7ceed60200000000fdffffff03220200000000000022512066535cb55a5b0c2f4f622e82cac9e1fada1e8a1a7aa1c866589b5fcee3da909e00000000000000001d6a5d1aff7f8196ec8ad08bc0a882edebb78a92908002ff7f9fb5939010215300000000000022512066535cb55a5b0c2f4f622e82cac9e1fada1e8a1a7aa1c866589b5fcee3da909e01403d3b50dddc61eb68e4e173cd0231cc94bf28997fb7a717dbaf69006f0a34b36a3252920c2988910d4e7fc23d6f5b08088f167bfa377b54d1e13f54e093d8c2090140b4695841983c6819186b5cba3c8a55956471cb24f0ae955ee29e30414f20904fbf9dca3d63237f565d8805eb1e442aa97be171294a0d9e9f46d6237da7320bb900000000';

describe('parseTxOutputs', () => {
  it('parses the 3 outputs of the fixture (segwit tx)', () => {
    const outs = parseTxOutputs(RAW_TX_HEX);
    expect(outs.length).toBe(3);
    expect(outs[0].value).toBe(546n);
    expect(outs[1].value).toBe(0n);
    expect(outs[1].scriptHex).toBe('6a5d1aff7f8196ec8ad08bc0a882edebb78a92908002ff7f9fb5939010');
    expect(outs[2].value).toBe(21281n);
  });

  it('finds the OP_RETURN at vout 1', () => {
    expect(findOpReturnVout(parseTxOutputs(RAW_TX_HEX))).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tx.test.ts`
Expected: FAIL (module `./tx` not found).

- [ ] **Step 3: Implement `src/tx.ts`**

```ts
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

export function findOpReturnVout(outputs: TxOutput[]): number {
  return outputs.findIndex((o) => o.scriptHex.startsWith('6a'));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tx.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git -C "C:/Alkanes Geral Dev/opreturn-decoder" add -A
git -C "C:/Alkanes Geral Dev/opreturn-decoder" commit -m "feat: segwit-aware tx output parser + OP_RETURN locator"
```

---

### Task 4: Runestone field decode (extract the protocol field)

**Files:**
- Create: `src/runestone.ts`
- Test: `src/runestone.test.ts`

**Interfaces:**
- Consumes: `leb128.ts` (`decipher`), `script.ts` (`parseOpReturn`) in the test.
- Produces:
  - `interface RunestoneFields { protocolValues: bigint[]; pointer?: number; }`
  - `decodeRunestone(payload: Uint8Array): RunestoneFields` — LEB128-decodes the payload into integers and collects the repeated `PROTOCOL` (16383) field values + optional rune `POINTER` (22). (Rune-level edicts/mint are out of scope for v1 — the meaningful edicts live inside the protostone.)

- [ ] **Step 1: Write the failing test**

`src/runestone.test.ts`:
```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/runestone.test.ts`
Expected: FAIL (module `./runestone` not found).

- [ ] **Step 3: Implement `src/runestone.ts`**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/runestone.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git -C "C:/Alkanes Geral Dev/opreturn-decoder" add -A
git -C "C:/Alkanes Geral Dev/opreturn-decoder" commit -m "feat: runestone field decode (extract protocol field)"
```

---

### Task 5: Protostone decipher

**Files:**
- Create: `src/protostone.ts`
- Test: `src/protostone.test.ts`

**Interfaces:**
- Consumes: `leb128.ts` (`joinToBytes`, `decipher`), `runestone.ts` + `script.ts` (in the test).
- Produces:
  - `interface RuneId { block: bigint; tx: bigint; }`
  - `interface ProtostoneEdict { id: RuneId; amount: bigint; output: bigint; }`
  - `interface Protostone { protocolTag: bigint; pointer?: number; refund?: number; burn?: bigint; from?: number; message: Uint8Array; edicts: ProtostoneEdict[]; }`
  - `decipherProtostones(protocolValues: bigint[]): Protostone[]` — port of `Protostone::decipher`.

- [ ] **Step 1: Write the failing test**

`src/protostone.test.ts`:
```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/protostone.test.ts`
Expected: FAIL (module `./protostone` not found).

- [ ] **Step 3: Implement `src/protostone.ts`**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/protostone.test.ts`
Expected: PASS (1 test). If the edict id or message differs, the bug is in `joinToBytes` padding or `toFields` grouping — fix against this fixture before moving on (this is risk #1 from the spec).

- [ ] **Step 5: Commit**

```bash
git -C "C:/Alkanes Geral Dev/opreturn-decoder" add -A
git -C "C:/Alkanes Geral Dev/opreturn-decoder" commit -m "feat: protostone decipher (port of Protostone::decipher)"
```

---

### Task 6: Cellpack decode

**Files:**
- Create: `src/cellpack.ts`
- Test: `src/cellpack.test.ts`

**Interfaces:**
- Consumes: `leb128.ts` (`decipher`), `protostone.ts` (`RuneId`).
- Produces:
  - `interface Cellpack { target: RuneId; opcode: bigint; inputs: bigint[]; cleanInputs: bigint[]; raw: bigint[]; }`
  - `decodeCellpack(message: Uint8Array): Cellpack` — LEB128-decodes the message into `[block, tx, ...inputs]`; `cleanInputs` trims trailing-zero alignment padding.

- [ ] **Step 1: Write the failing test**

`src/cellpack.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { hexToBytes } from './hex';
import { decodeCellpack } from './cellpack';

describe('decodeCellpack', () => {
  it('decodes the fixture message, trimming 15-byte padding', () => {
    const cp = decodeCellpack(hexToBytes('02bbde040102000000000000000000'));
    expect(cp.target).toEqual({ block: 2n, tx: 77627n });
    expect(cp.opcode).toBe(1n);
    expect(cp.cleanInputs).toEqual([2n]);
    // raw still matches the literal alkanes-rs decode (with padding zeros)
    expect(cp.raw).toEqual([2n, 77627n, 1n, 2n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n]);
    expect(cp.inputs).toEqual([1n, 2n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n]);
  });

  it('throws on a message too short to hold a target', () => {
    expect(() => decodeCellpack(hexToBytes('02'))).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/cellpack.test.ts`
Expected: FAIL (module `./cellpack` not found).

- [ ] **Step 3: Implement `src/cellpack.ts`**

```ts
import { decipher } from './leb128';
import type { RuneId } from './protostone';

export interface Cellpack {
  target: RuneId;
  opcode: bigint;
  inputs: bigint[];
  cleanInputs: bigint[];
  raw: bigint[];
}

/** Decode a protostone message into a cellpack. Wire format is LEB128 of
 *  [block, tx, ...inputs]; opcode = inputs[0] by convention. The message is
 *  15-byte-segment padded, so trailing-zero inputs are alignment padding. */
export function decodeCellpack(message: Uint8Array): Cellpack {
  const raw = decipher(message);
  if (raw.length < 2) throw new Error('cellpack too short (no target block:tx)');

  const target: RuneId = { block: raw[0], tx: raw[1] };
  const inputs = raw.slice(2);

  let end = inputs.length;
  while (end > 0 && inputs[end - 1] === 0n) end--;
  const cleanInputs = inputs.slice(0, end);

  const opcode = inputs.length > 0 ? inputs[0] : 0n;
  return { target, opcode, inputs, cleanInputs, raw };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/cellpack.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git -C "C:/Alkanes Geral Dev/opreturn-decoder" add -A
git -C "C:/Alkanes Geral Dev/opreturn-decoder" commit -m "feat: cellpack decode with 15-byte padding trim"
```

---

### Task 7: Burn detection

**Files:**
- Create: `src/burn.ts`
- Test: `src/burn.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface BurnVerdict { burned: boolean; undetermined?: boolean; reason?: string; }`
  - `detectBurn(p: { pointer?: number; refund?: number }, opReturnVout?: number): BurnVerdict`

- [ ] **Step 1: Write the failing test**

`src/burn.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { detectBurn } from './burn';

describe('detectBurn', () => {
  it('flags burn when pointer hits the OP_RETURN vout (fixture)', () => {
    const v = detectBurn({ pointer: 1, refund: 0 }, 1);
    expect(v.burned).toBe(true);
    expect(v.reason).toContain('pointer');
    expect(v.reason).toContain('vout 1');
  });

  it('no burn when pointer/refund avoid the OP_RETURN vout', () => {
    expect(detectBurn({ pointer: 0, refund: 2 }, 1)).toEqual({ burned: false });
  });

  it('is undetermined without a known OP_RETURN vout', () => {
    const v = detectBurn({ pointer: 1 }, undefined);
    expect(v.burned).toBe(false);
    expect(v.undetermined).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/burn.test.ts`
Expected: FAIL (module `./burn` not found).

- [ ] **Step 3: Implement `src/burn.ts`**

```ts
export interface BurnVerdict {
  burned: boolean;
  undetermined?: boolean;
  reason?: string;
}

/** Burn ⟺ pointer (or refund) points at the OP_RETURN's own vout index. */
export function detectBurn(
  p: { pointer?: number; refund?: number },
  opReturnVout?: number,
): BurnVerdict {
  if (opReturnVout === undefined) {
    return {
      burned: false,
      undetermined: true,
      reason: 'OP_RETURN vout desconhecido; passe txid/--rawtx ou --opreturn-vout N',
    };
  }
  const hits: string[] = [];
  if (p.pointer === opReturnVout) hits.push(`pointer (${p.pointer})`);
  if (p.refund === opReturnVout) hits.push(`refund (${p.refund})`);
  if (hits.length > 0) {
    return {
      burned: true,
      reason: `${hits.join(' e ')} aponta(m) pro OP_RETURN (vout ${opReturnVout}) → alkanes QUEIMADOS`,
    };
  }
  return { burned: false };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/burn.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git -C "C:/Alkanes Geral Dev/opreturn-decoder" add -A
git -C "C:/Alkanes Geral Dev/opreturn-decoder" commit -m "feat: burn detection (pointer/refund -> OP_RETURN vout)"
```

---

### Task 8: Orchestrator (decode pipeline)

**Files:**
- Create: `src/decode.ts`
- Test: `src/decode.test.ts`

**Interfaces:**
- Consumes: `script.ts`, `tx.ts`, `runestone.ts`, `protostone.ts`, `cellpack.ts`, `burn.ts`.
- Produces:
  - `interface DecodedProtostone extends Protostone { isAlkanes: boolean; cellpack?: Cellpack; burn: BurnVerdict; }`
  - `interface DecodeResult { opReturnHex: string; opReturnVout?: number; runePointer?: number; protostones: DecodedProtostone[]; }`
  - `decodeOpReturn(opReturnHex: string, opReturnVout?: number): DecodeResult`
  - `decodeRawTx(rawTxHex: string): DecodeResult`

- [ ] **Step 1: Write the failing test**

`src/decode.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { bytesToHex } from './hex';
import { decodeRawTx } from './decode';

const RAW_TX_HEX =
  '020000000001026d47e28157914e7b60151c49271e4862a15195a4184c17f2f62bd71b0a7ceed60000000000fdffffff6d47e28157914e7b60151c49271e4862a15195a4184c17f2f62bd71b0a7ceed60200000000fdffffff03220200000000000022512066535cb55a5b0c2f4f622e82cac9e1fada1e8a1a7aa1c866589b5fcee3da909e00000000000000001d6a5d1aff7f8196ec8ad08bc0a882edebb78a92908002ff7f9fb5939010215300000000000022512066535cb55a5b0c2f4f622e82cac9e1fada1e8a1a7aa1c866589b5fcee3da909e01403d3b50dddc61eb68e4e173cd0231cc94bf28997fb7a717dbaf69006f0a34b36a3252920c2988910d4e7fc23d6f5b08088f167bfa377b54d1e13f54e093d8c2090140b4695841983c6819186b5cba3c8a55956471cb24f0ae955ee29e30414f20904fbf9dca3d63237f565d8805eb1e442aa97be171294a0d9e9f46d6237da7320bb900000000';

describe('decodeRawTx (fixture: burned bond)', () => {
  const r = decodeRawTx(RAW_TX_HEX);

  it('locates the OP_RETURN at vout 1', () => {
    expect(r.opReturnVout).toBe(1);
  });

  it('decodes a single Alkanes protostone with the expected fields', () => {
    expect(r.protostones.length).toBe(1);
    const s = r.protostones[0];
    expect(s.isAlkanes).toBe(true);
    expect(s.protocolTag).toBe(1n);
    expect(s.pointer).toBe(1);
    expect(s.refund).toBe(0);
    expect(s.edicts).toEqual([{ id: { block: 2n, tx: 77087n }, amount: 2n, output: 1n }]);
    expect(bytesToHex(s.message)).toBe('02bbde040102000000000000000000');
  });

  it('unpacks the cellpack (target 2:77627, opcode 1, clean input [2])', () => {
    const cp = r.protostones[0].cellpack!;
    expect(cp.target).toEqual({ block: 2n, tx: 77627n });
    expect(cp.opcode).toBe(1n);
    expect(cp.cleanInputs).toEqual([2n]);
  });

  it('fires the burn warning (pointer 1 -> OP_RETURN vout 1)', () => {
    expect(r.protostones[0].burn.burned).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/decode.test.ts`
Expected: FAIL (module `./decode` not found).

- [ ] **Step 3: Implement `src/decode.ts`**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/decode.test.ts`
Expected: PASS (4 tests). This is acceptance criteria 1, 2, 3 in one shot.

- [ ] **Step 5: Commit**

```bash
git -C "C:/Alkanes Geral Dev/opreturn-decoder" add -A
git -C "C:/Alkanes Geral Dev/opreturn-decoder" commit -m "feat: decode orchestrator (OP_RETURN + raw-tx) — fixture green"
```

---

### Task 9: Raw-tx fetch resolver (the only network piece)

**Files:**
- Create: `src/fetch.ts`
- Test: `src/fetch.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type RawTxSource = 'mempool' | 'subfrost' | 'alkanode'`
  - `interface FetchOptions { sources?: RawTxSource[]; subfrostApiKey?: string; fetchImpl?: typeof fetch; }`
  - `rawTxUrl(source: RawTxSource, txid: string, opts?: FetchOptions): string`
  - `fetchRawTx(txid: string, opts?: FetchOptions): Promise<string>` — tries sources in order; one retry on transient failure (covers the subfrost `-32603`).

- [ ] **Step 1: Write the failing test**

`src/fetch.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { rawTxUrl, fetchRawTx } from './fetch';

const TXID = 'b9f28df473ed333f1b20359e8d25d29f8dee0e25004119e9b9fdc21f77e72f5e';

describe('rawTxUrl', () => {
  it('builds the mempool.space hex endpoint', () => {
    expect(rawTxUrl('mempool', TXID)).toBe(`https://mempool.space/api/tx/${TXID}/hex`);
  });
  it('builds the subfrost gateway endpoint with an api key', () => {
    expect(rawTxUrl('subfrost', TXID, { subfrostApiKey: 'KEY' })).toContain('mainnet.subfrost.io/v4/KEY');
  });
});

describe('fetchRawTx', () => {
  it('returns hex from the first working source (injected fetch)', async () => {
    const fakeFetch = (async () =>
      new Response('deadbeef', { status: 200 })) as unknown as typeof fetch;
    const hex = await fetchRawTx(TXID, { fetchImpl: fakeFetch });
    expect(hex).toBe('deadbeef');
  });

  it('falls through to the next source on failure', async () => {
    let calls = 0;
    const fakeFetch = (async () => {
      calls++;
      if (calls <= 2) return new Response('err', { status: 500 }); // mempool fails (1 try + 1 retry)
      return new Response('cafe', { status: 200 });
    }) as unknown as typeof fetch;
    const hex = await fetchRawTx(TXID, { sources: ['mempool', 'alkanode'], fetchImpl: fakeFetch });
    expect(hex).toBe('cafe');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/fetch.test.ts`
Expected: FAIL (module `./fetch` not found).

- [ ] **Step 3: Implement `src/fetch.ts`**

```ts
export type RawTxSource = 'mempool' | 'subfrost' | 'alkanode';

export interface FetchOptions {
  sources?: RawTxSource[];
  subfrostApiKey?: string;
  fetchImpl?: typeof fetch;
}

export function rawTxUrl(source: RawTxSource, txid: string, opts: FetchOptions = {}): string {
  switch (source) {
    case 'mempool':
      return `https://mempool.space/api/tx/${txid}/hex`;
    case 'subfrost':
      return `https://mainnet.subfrost.io/v4/${opts.subfrostApiKey ?? ''}/esplora/tx/${txid}/hex`;
    case 'alkanode':
      return `https://api.alkanode.com/tx/${txid}/hex`;
  }
}

const HEX_RE = /^[0-9a-fA-F]+$/;

/** Resolve a txid to its raw tx hex, trying sources in order with one retry
 *  each (covers the transient subfrost -32603). The decode is offline; this
 *  is the only network call. */
export async function fetchRawTx(txid: string, opts: FetchOptions = {}): Promise<string> {
  const f = opts.fetchImpl ?? fetch;
  const sources = opts.sources ?? ['mempool', 'subfrost', 'alkanode'];
  let lastErr: unknown;
  for (const source of sources) {
    const url = rawTxUrl(source, txid, opts);
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await f(url);
        if (!res.ok) {
          lastErr = new Error(`${source} HTTP ${res.status}`);
          continue;
        }
        const text = (await res.text()).trim();
        if (!HEX_RE.test(text)) {
          lastErr = new Error(`${source} returned non-hex`);
          continue;
        }
        return text;
      } catch (e) {
        lastErr = e;
      }
    }
  }
  throw new Error(`failed to fetch raw tx ${txid}: ${String(lastErr)}`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/fetch.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git -C "C:/Alkanes Geral Dev/opreturn-decoder" add -A
git -C "C:/Alkanes Geral Dev/opreturn-decoder" commit -m "feat: pluggable raw-tx fetch resolver"
```

---

### Task 10: Formatter + CLI

**Files:**
- Create: `src/format.ts`
- Create: `src/cli.ts`
- Test: `src/format.test.ts`

**Interfaces:**
- Consumes: `decode.ts` (`DecodeResult`).
- Produces:
  - `format.ts`: `formatResult(r: DecodeResult): string`
  - `cli.ts`: `runCli(argv: string[]): Promise<number>` (returns exit code) + a `main` entry that calls `process.exit`.

- [ ] **Step 1: Write the failing test**

`src/format.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { decodeRawTx } from './decode';
import { formatResult } from './format';

const RAW_TX_HEX =
  '020000000001026d47e28157914e7b60151c49271e4862a15195a4184c17f2f62bd71b0a7ceed60000000000fdffffff6d47e28157914e7b60151c49271e4862a15195a4184c17f2f62bd71b0a7ceed60200000000fdffffff03220200000000000022512066535cb55a5b0c2f4f622e82cac9e1fada1e8a1a7aa1c866589b5fcee3da909e00000000000000001d6a5d1aff7f8196ec8ad08bc0a882edebb78a92908002ff7f9fb5939010215300000000000022512066535cb55a5b0c2f4f622e82cac9e1fada1e8a1a7aa1c866589b5fcee3da909e01403d3b50dddc61eb68e4e173cd0231cc94bf28997fb7a717dbaf69006f0a34b36a3252920c2988910d4e7fc23d6f5b08088f167bfa377b54d1e13f54e093d8c2090140b4695841983c6819186b5cba3c8a55956471cb24f0ae955ee29e30414f20904fbf9dca3d63237f565d8805eb1e442aa97be171294a0d9e9f46d6237da7320bb900000000';

describe('formatResult', () => {
  const text = formatResult(decodeRawTx(RAW_TX_HEX));

  it('renders the cellpack target and opcode', () => {
    expect(text).toContain('2:77627');
    expect(text).toContain('opcode 1');
  });

  it('includes a prominent burn warning', () => {
    expect(text.toUpperCase()).toContain('QUEIMADOS');
  });

  it('reports the edict token 2:77087', () => {
    expect(text).toContain('2:77087');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/format.test.ts`
Expected: FAIL (module `./format` not found).

- [ ] **Step 3: Implement `src/format.ts`**

```ts
import type { DecodeResult, DecodedProtostone } from './decode';

function fmtEdicts(s: DecodedProtostone): string {
  if (s.edicts.length === 0) return '  edicts: (nenhum)';
  return s.edicts
    .map(
      (e) => `  edict: ${e.amount} de ${e.id.block}:${e.id.tx} → vout ${e.output}`,
    )
    .join('\n');
}

function fmtProtostone(s: DecodedProtostone, i: number): string {
  const lines: string[] = [];
  lines.push(`── Protostone #${i} ${s.isAlkanes ? '(Alkanes)' : ''} ──`);
  lines.push(`  protocol_tag: ${s.protocolTag}`);
  lines.push(`  pointer: ${s.pointer ?? '(nenhum)'}   refund: ${s.refund ?? '(nenhum)'}`);
  lines.push(fmtEdicts(s));

  if (s.cellpack) {
    const cp = s.cellpack;
    lines.push(
      `  cellpack: target ${cp.target.block}:${cp.target.tx}, opcode ${cp.opcode}, inputs [${cp.cleanInputs.join(', ')}]`,
    );
    const summary = `Alkanes call ao ${cp.target.block}:${cp.target.tx}, opcode ${cp.opcode}`;
    const edictPart = s.edicts.length
      ? `, com edict de ${s.edicts[0].amount} (${s.edicts[0].id.block}:${s.edicts[0].id.tx}) → vout ${s.edicts[0].output}`
      : '';
    lines.push(`  resumo: ${summary}${edictPart}.`);
  }

  if (s.burn.burned) {
    lines.push(`  ⚠️  BURN: ${s.burn.reason}`);
  } else if (s.burn.undetermined) {
    lines.push(`  ?  burn indeterminado: ${s.burn.reason}`);
  }
  return lines.join('\n');
}

export function formatResult(r: DecodeResult): string {
  const head = `OP_RETURN${r.opReturnVout !== undefined ? ` (vout ${r.opReturnVout})` : ''}: ${r.opReturnHex}`;
  if (r.protostones.length === 0) return `${head}\n(sem protostones)`;
  return [head, ...r.protostones.map((s, i) => fmtProtostone(s, i))].join('\n');
}
```

- [ ] **Step 4: Implement `src/cli.ts`**

```ts
import { decodeOpReturn, decodeRawTx, type DecodeResult } from './decode';
import { fetchRawTx, type RawTxSource } from './fetch';
import { formatResult } from './format';

function parseArgs(argv: string[]) {
  const args: {
    txid?: string;
    hex?: string;
    rawtx?: string;
    opReturnVout?: number;
    sources?: RawTxSource[];
    subfrostApiKey?: string;
  } = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--hex') args.hex = argv[++i];
    else if (a === '--rawtx') args.rawtx = argv[++i];
    else if (a === '--opreturn-vout') args.opReturnVout = Number(argv[++i]);
    else if (a === '--source') args.sources = argv[++i].split(',') as RawTxSource[];
    else if (a === '--subfrost-key') args.subfrostApiKey = argv[++i];
    else if (!a.startsWith('-')) args.txid = a;
  }
  return args;
}

export async function runCli(argv: string[]): Promise<number> {
  const args = parseArgs(argv);
  let result: DecodeResult;
  try {
    if (args.hex) {
      result = decodeOpReturn(args.hex, args.opReturnVout);
    } else if (args.rawtx) {
      result = decodeRawTx(args.rawtx);
    } else if (args.txid) {
      const raw = await fetchRawTx(args.txid, {
        sources: args.sources,
        subfrostApiKey: args.subfrostApiKey,
      });
      result = decodeRawTx(raw);
    } else {
      console.error('uso: opreturn-decode <txid> | --hex <OP_RETURN_hex> [--opreturn-vout N] | --rawtx <hex>');
      return 2;
    }
  } catch (e) {
    console.error(`erro: ${(e as Error).message}`);
    return 1;
  }
  console.log(formatResult(result));
  return 0;
}

// Entry point
runCli(process.argv.slice(2)).then((code) => process.exit(code));
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/format.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Manually verify the CLI (acceptance criterion 5)**

Run (offline, raw-tx mode):
`npx tsx src/cli.ts --rawtx 020000000001026d47e28157914e7b60151c49271e4862a15195a4184c17f2f62bd71b0a7ceed60000000000fdffffff6d47e28157914e7b60151c49271e4862a15195a4184c17f2f62bd71b0a7ceed60200000000fdffffff03220200000000000022512066535cb55a5b0c2f4f622e82cac9e1fada1e8a1a7aa1c866589b5fcee3da909e00000000000000001d6a5d1aff7f8196ec8ad08bc0a882edebb78a92908002ff7f9fb5939010215300000000000022512066535cb55a5b0c2f4f622e82cac9e1fada1e8a1a7aa1c866589b5fcee3da909e01403d3b50dddc61eb68e4e173cd0231cc94bf28997fb7a717dbaf69006f0a34b36a3252920c2988910d4e7fc23d6f5b08088f167bfa377b54d1e13f54e093d8c2090140b4695841983c6819186b5cba3c8a55956471cb24f0ae955ee29e30414f20904fbf9dca3d63237f565d8805eb1e442aa97be171294a0d9e9f46d6237da7320bb900000000`
Expected: prints the protostone, cellpack `2:77627 opcode 1`, edict `2:77087`, and the burn warning.

- [ ] **Step 7: Commit**

```bash
git -C "C:/Alkanes Geral Dev/opreturn-decoder" add -A
git -C "C:/Alkanes Geral Dev/opreturn-decoder" commit -m "feat: human-readable formatter + CLI"
```

---

### Task 11: Healthy-tx contrast fixture (acceptance criterion 4)

**Files:**
- Create: `test/fixtures/healthy.json`
- Create: `src/healthy.test.ts`
- Modify: `vitest.config.ts` (no change needed; `src/**/*.test.ts` already covers it)

**Interfaces:**
- Consumes: `decode.ts` (`decodeRawTx`).
- Produces: a stored healthy fixture + a structural test asserting a non-burn Alkanes decode.

- [ ] **Step 1: Obtain a healthy Alkanes tx and save the fixture**

Find a healthy (non-burn) Alkanes mainnet tx. Concrete method:
1. DIESEL mints and AMM swaps are common Alkanes txs whose `pointer` targets a real output (not the OP_RETURN). Pick a recent one via espo (`https://espo.sh/docs`, e.g. an `ammdata`/`essentials` recent-tx method) or any known DIESEL mint / `2:77087` swap txid.
2. Fetch its raw hex: `curl -s "https://mempool.space/api/tx/<TXID>/hex"`.
3. Decode it locally to confirm it is **not** a burn and has ≥1 Alkanes protostone:
   `npx tsx src/cli.ts --rawtx <RAWHEX>`
4. Save `test/fixtures/healthy.json` as:
```json
{ "txid": "<TXID>", "rawTxHex": "<RAWHEX>", "expect": { "burned": false, "protocolTag": "1" } }
```
Cross-check the decoded protostone fields against `espo.sh/tx/<TXID>`.

- [ ] **Step 2: Write the test**

`src/healthy.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { decodeRawTx } from './decode';

const fx = JSON.parse(readFileSync(new URL('../test/fixtures/healthy.json', import.meta.url), 'utf8'));

describe('healthy (non-burn) Alkanes tx', () => {
  const r = decodeRawTx(fx.rawTxHex);

  it('decodes at least one Alkanes protostone', () => {
    const alk = r.protostones.filter((s) => s.isAlkanes);
    expect(alk.length).toBeGreaterThanOrEqual(1);
    expect(alk[0].protocolTag.toString()).toBe(fx.expect.protocolTag);
  });

  it('does NOT fire a burn warning', () => {
    expect(r.protostones.some((s) => s.burn.burned)).toBe(false);
  });

  it('unpacks a cellpack with a valid target', () => {
    const cp = r.protostones.find((s) => s.cellpack)?.cellpack;
    expect(cp).toBeDefined();
    expect(cp!.target.block).toBeGreaterThanOrEqual(0n);
  });
});
```

- [ ] **Step 3: Run the test to verify it passes**

Run: `npx vitest run src/healthy.test.ts`
Expected: PASS (3 tests). If the chosen tx happens to be a burn or non-Alkanes, pick a different one in Step 1.

- [ ] **Step 4: Run the full suite**

Run: `npx vitest run`
Expected: ALL green (Tasks 1–11).

- [ ] **Step 5: Commit**

```bash
git -C "C:/Alkanes Geral Dev/opreturn-decoder" add -A
git -C "C:/Alkanes Geral Dev/opreturn-decoder" commit -m "test: healthy non-burn Alkanes tx contrast fixture"
```

---

## Acceptance Criteria → Task map

1. Fixture protostone fields reproduced — **Task 5 + Task 8**.
2. Cellpack unpacked to `Vec<u128>` and labeled, matching alkanes-rs (incl. 15-byte padding) — **Task 6 + Task 8**.
3. Burn warning fires on the fixture — **Task 7 + Task 8 + Task 10**.
4. Runs on a healthy tx with correct decode — **Task 11**.
5. Accepts txid, OP_RETURN hex, and raw-tx hex — **Task 9 (txid) + Task 8 (rawtx/opReturn) + Task 10 (CLI wiring)**.

## Notes / risks (from the spec)

- **#1 — 15-byte padding (Task 5/6):** the message carries alignment zeros; `joinToBytes` reproduces them and `cellpack.cleanInputs` trims them. Validated against the real fixture hex.
- **Runestone tags (Task 4):** PROTOCOL=16383, rune POINTER=22, BODY=0 — confirmed against the fixture payload (`ff7f` = 16383, appears twice).
- **Edict delta-encoding (Task 5):** `nextEdictId` — block adds; if block==0, tx adds. Validated by the `2:77087` edict.
- **Healthy fixture discovery (Task 11):** requires picking a real non-burn Alkanes tx; structural assertions keep the test robust to which one.
