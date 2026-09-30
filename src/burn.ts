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
      reason: 'OP_RETURN vout unknown; pass a txid, --rawtx, or --opreturn-vout N',
    };
  }
  const hits: string[] = [];
  if (p.pointer === opReturnVout) hits.push(`pointer (${p.pointer})`);
  if (p.refund === opReturnVout) hits.push(`refund (${p.refund})`);
  if (hits.length > 0) {
    return {
      burned: true,
      reason: `${hits.join(' and ')} point(s) at the OP_RETURN (vout ${opReturnVout}) → alkanes BURNED`,
    };
  }
  return { burned: false };
}
