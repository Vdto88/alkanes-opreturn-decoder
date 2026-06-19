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
