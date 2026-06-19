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
