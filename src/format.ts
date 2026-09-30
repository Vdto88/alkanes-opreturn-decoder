import type { DecodeResult, DecodedProtostone } from './decode';

function fmtEdicts(s: DecodedProtostone): string {
  if (s.edicts.length === 0) return '  edicts: (none)';
  return s.edicts
    .map(
      (e) => `  edict: ${e.amount} of ${e.id.block}:${e.id.tx} → vout ${e.output}`,
    )
    .join('\n');
}

function fmtProtostone(s: DecodedProtostone, i: number): string {
  const lines: string[] = [];
  lines.push(`── Protostone #${i}${s.isAlkanes ? ' (Alkanes)' : ''} ──`);
  lines.push(`  protocol_tag: ${s.protocolTag}`);
  lines.push(`  pointer: ${s.pointer ?? '(none)'}   refund: ${s.refund ?? '(none)'}`);
  lines.push(fmtEdicts(s));

  if (s.cellpack) {
    const cp = s.cellpack;
    lines.push(
      `  cellpack: target ${cp.target.block}:${cp.target.tx}, opcode ${cp.opcode}, inputs [${cp.cleanInputs.join(', ')}]`,
    );
    const summary = `Alkanes call to ${cp.target.block}:${cp.target.tx}, opcode ${cp.opcode}`;
    const edictPart = s.edicts.length
      ? `, with an edict of ${s.edicts[0].amount} (${s.edicts[0].id.block}:${s.edicts[0].id.tx}) → vout ${s.edicts[0].output}`
      : '';
    lines.push(`  summary: ${summary}${edictPart}.`);
  }

  if (s.burn.burned) {
    lines.push(`  ⚠️  BURN: ${s.burn.reason}`);
  } else if (s.burn.undetermined) {
    lines.push(`  ?  burn undetermined: ${s.burn.reason}`);
  }
  return lines.join('\n');
}

export function formatResult(r: DecodeResult): string {
  const head = `OP_RETURN${r.opReturnVout !== undefined ? ` (vout ${r.opReturnVout})` : ''}: ${r.opReturnHex}`;
  if (r.protostones.length === 0) return `${head}\n(no protostones)`;
  return [head, ...r.protostones.map((s, i) => fmtProtostone(s, i))].join('\n');
}
