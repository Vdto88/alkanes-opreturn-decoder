import { describe, it, expect, beforeAll } from 'vitest';
import { bytesToHex } from './hex';
import { decodeRawTx } from './decode';

const RAW_TX_HEX =
  '020000000001026d47e28157914e7b60151c49271e4862a15195a4184c17f2f62bd71b0a7ceed60000000000fdffffff6d47e28157914e7b60151c49271e4862a15195a4184c17f2f62bd71b0a7ceed60200000000fdffffff03220200000000000022512066535cb55a5b0c2f4f622e82cac9e1fada1e8a1a7aa1c866589b5fcee3da909e00000000000000001d6a5d1aff7f8196ec8ad08bc0a882edebb78a92908002ff7f9fb5939010215300000000000022512066535cb55a5b0c2f4f622e82cac9e1fada1e8a1a7aa1c866589b5fcee3da909e01403d3b50dddc61eb68e4e173cd0231cc94bf28997fb7a717dbaf69006f0a34b36a3252920c2988910d4e7fc23d6f5b08088f167bfa377b54d1e13f54e093d8c2090140b4695841983c6819186b5cba3c8a55956471cb24f0ae955ee29e30414f20904fbf9dca3d63237f565d8805eb1e442aa97be171294a0d9e9f46d6237da7320bb900000000';

describe('decodeRawTx (fixture: burned bond)', () => {
  let r: ReturnType<typeof decodeRawTx>;
  beforeAll(() => { r = decodeRawTx(RAW_TX_HEX); });

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

describe('decodeRawTx (negative)', () => {
  it('throws when the transaction has no Runestone OP_RETURN', () => {
    // minimal legacy tx: 1 input, 1 output with script OP_1 (0x51) — no 6a5d OP_RETURN
    const noOpReturnTx =
      '010000000100000000000000000000000000000000000000000000000000000000000000000000000000ffffffff010000000000000000015100000000';
    expect(() => decodeRawTx(noOpReturnTx)).toThrow();
  });
});
