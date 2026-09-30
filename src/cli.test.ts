import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runCli } from './cli';

const RAW_TX_HEX =
  '020000000001026d47e28157914e7b60151c49271e4862a15195a4184c17f2f62bd71b0a7ceed60000000000fdffffff6d47e28157914e7b60151c49271e4862a15195a4184c17f2f62bd71b0a7ceed60200000000fdffffff03220200000000000022512066535cb55a5b0c2f4f622e82cac9e1fada1e8a1a7aa1c866589b5fcee3da909e00000000000000001d6a5d1aff7f8196ec8ad08bc0a882edebb78a92908002ff7f9fb5939010215300000000000022512066535cb55a5b0c2f4f622e82cac9e1fada1e8a1a7aa1c866589b5fcee3da909e01403d3b50dddc61eb68e4e173cd0231cc94bf28997fb7a717dbaf69006f0a34b36a3252920c2988910d4e7fc23d6f5b08088f167bfa377b54d1e13f54e093d8c2090140b4695841983c6819186b5cba3c8a55956471cb24f0ae955ee29e30414f20904fbf9dca3d63237f565d8805eb1e442aa97be171294a0d9e9f46d6237da7320bb900000000';

describe('runCli', () => {
  let log: ReturnType<typeof vi.spyOn>;
  let err: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    log = vi.spyOn(console, 'log').mockImplementation(() => {});
    err = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    log.mockRestore();
    err.mockRestore();
  });

  it('returns exit code 2 and prints usage when no input is given', async () => {
    const code = await runCli([]);
    expect(code).toBe(2);
    expect(err).toHaveBeenCalled();
  });

  it('decodes a raw tx offline and returns 0 (and the module imports without exiting)', async () => {
    const code = await runCli(['--rawtx', RAW_TX_HEX]);
    expect(code).toBe(0);
    const printed = log.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(printed).toContain('2:77627');
    expect(printed).toContain('BURNED');
  });
});
