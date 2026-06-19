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
