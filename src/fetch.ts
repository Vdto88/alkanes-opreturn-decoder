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
      if (!opts.subfrostApiKey) throw new Error('subfrostApiKey required for subfrost source');
      return `https://mainnet.subfrost.io/v4/${opts.subfrostApiKey}/esplora/tx/${txid}/hex`;
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
          break; // non-hex 200 is a semantic mismatch, not transient — try next source
        }
        return text;
      } catch (e) {
        lastErr = e;
      }
    }
  }
  throw new Error(`failed to fetch raw tx ${txid}: ${String(lastErr)}`);
}
