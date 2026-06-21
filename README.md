# Alkanes-aware OP_RETURN decoder

A tiny, **pure-offline** TypeScript decoder for a single Bitcoin transaction. Give it a
**txid**, an **OP_RETURN hex**, or a **raw-tx hex** and it returns the Runestone, every
Protostone (protocol tag, edicts, pointer, refund, message, burn, from) and the unpacked
**Alkanes cellpack** in plain language — including a **burn warning** when a Protostone points
its output at the OP_RETURN.

## Why

Generic explorers (e.g. mempool.space) classify a Runestone by its tag, so **Alkanes activity
shows up as an undifferentiated `OP_RETURN`**. This tool reads the protostone/cellpack layer and
tells you *what the transaction actually does*: which contract is called, with which opcode, which
edicts move, and whether tokens were burned.

The decode logic is ported from the canonical Rust runtime
([`alkanes-rs`](https://github.com/kungfuflex/alkanes-rs)) and the test suite checks it against
those canonical values.

## Install

```bash
git clone https://github.com/Vdto88/alkanes-opreturn-decoder
cd alkanes-opreturn-decoder
npm install
npm test          # 41/41 green
```

## Usage

```bash
# 1) By txid (the only mode that touches the network — fetches the raw tx)
npx tsx src/cli.ts <txid>

# 2) From a full raw-tx hex (100% offline)
npx tsx src/cli.ts --rawtx <rawtx_hex>

# 3) From a single OP_RETURN script hex (offline; pass the vout so burn can be detected)
npx tsx src/cli.ts --hex <op_return_hex> --opreturn-vout <N>
```

### Example — a burned bond

```bash
npx tsx src/cli.ts b9f28df473ed333f1b20359e8d25d29f8dee0e25004119e9b9fdc21f77e72f5e
```

```
OP_RETURN (vout 1): 6a5d1aff7f8196ec8ad08bc0a882edebb78a92908002ff7f9fb5939010
── Protostone #0 (Alkanes) ──
  protocol_tag: 1
  pointer: 1   refund: 0
  edict: 2 de 2:77087 → vout 1
  cellpack: target 2:77627, opcode 1, inputs [2]
  resumo: Alkanes call ao 2:77627, opcode 1, com edict de 2 (2:77087) → vout 1.
  ⚠️  BURN: pointer (1) aponta(m) pro OP_RETURN (vout 1) → alkanes QUEIMADOS
```

The pointer sends the output to the OP_RETURN's own vout, so the user's LP token is **burned**.
For contrast, the healthy parent transaction that funded it decodes to two protostones with **no**
burn:

```bash
npx tsx src/cli.ts d6ee7c0a1bd72bf6f2174c18a49551a162481e27491c15607b4e915781e2476d
```

## Sources

`--source` picks where the raw tx is fetched (comma-separated, tried in order):

| source     | endpoint                                              | notes                          |
|------------|-------------------------------------------------------|--------------------------------|
| `mempool`  | `mempool.space/api/tx/<txid>/hex`                     | default, no key                |
| `subfrost` | `mainnet.subfrost.io/v4/<key>/esplora/tx/<txid>/hex`  | needs `--subfrost-key <key>`   |
| `alkanode` | `api.alkanode.com/tx/<txid>/hex`                      |                                |

```bash
npx tsx src/cli.ts <txid> --source subfrost --subfrost-key <YOUR_KEY>
```

## What it decodes

`raw tx → Runestone (OP_RETURN OP_13) → Protostones → Alkanes cellpack`

- **Runestone / Protostone** parsing follows `protorune-support`'s `decipher` (tags, LEB128,
  delta-encoded edicts, 15-byte message segments).
- **Cellpack** is the LEB128 of `[block, tx, ...inputs]`; `target` = the first two values, `opcode`
  = `inputs[0]` by convention. Padding zeros from the 15-byte message packing are trimmed.
- **Burn** is detected when a protostone's `pointer`/`refund` equals the index of the vout that
  *is* the OP_RETURN — which requires the vout layout (txid / `--rawtx` modes).

## License

MIT — see [LICENSE](LICENSE).
