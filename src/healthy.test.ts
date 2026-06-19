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
