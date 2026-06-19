# Alkanes-aware OP_RETURN decoder — v1 (decode de 1 tx)

> Design fechado no brainstorm de **2026-06-19**. Escopo de produto travado no kickoff
> `C:\Alkanes Geral Dev\kickoff-opreturn-decoder.md` (v1 = decodificar UMA transação).
> Abordagem de implementação escolhida pelo usuário: **TS, portando o decode do alkanes-rs**.

## 1. Objetivo

Ferramenta que recebe **um txid** ou o **hex cru de um OP_RETURN** (ou o raw da tx inteira) e
devolve, de forma legível: o runestone, cada **protostone** (`protocol_tag`, `edicts`, `pointer`,
`refund`, `message`, `burn`, `from`) e, quando for Alkanes, o **cellpack** desempacotado
(target `block:tx`, opcode, inputs). Com **aviso de burn** em destaque.

**Por que importa:** é a ferramenta que o artigo `03-its-not-runes.md` diz não existir — o
OP_RETURN report do mempool.space só casa prefixo de Runes, então Alkanes (que anda dentro de um
envelope compatível com Runes) fica invisível. Esta enxerga. Automatiza o que o mork1e fez na mão.

## 2. Escopo

**Dentro (v1):** entrada por txid (busca o raw), por hex de OP_RETURN colado, ou por raw-tx hex;
parse do runestone; parse de cada protostone; decode do cellpack Alkanes; saída legível + resumo
de 1 linha; flag de burn. CLI fino + função `decode()` testável + testes vitest.

**Fora (v2+):** varredura de blocos, % por protocolo (o número 91% do Cuny), UI web, persistência.

## 3. Decisão de abordagem (e porquê)

Escolhido: **TypeScript, portando o decode do `alkanes-rs`**. Justificativa apurada na exploração:

- O `@alkanes/ts-sdk` publicado **não** expõe decode offline — o decode de runestone dele passa
  por `provider.runestone_decode_tx_js(txid)` (**WASM + rede**), não é puro parse de bytes.
- Os **primitivos LEB128/packing já estão portados em TS** em
  `C:\refs\alkanes-rs\ts-sdk\src\protostone\bytes.ts` (`decodeVarInt`, `decipher`, `unpack`/`pack`,
  `fromBuffer`). Reusamos esses.
- O **decode estruturado canônico é Rust** (`C:\refs\alkanes-rs\crates\protorune-support\src\protostone.rs`),
  pequeno (~350 linhas) e portável. A camada Runestone (extrair o campo `protocol`) vem do crate
  `ordinals` (fork do `@magiceden-oss/runestone-lib`).

Resultado: 100% offline, sem rede e sem WASM no núcleo; **zero contato com o toolchain Rust 1.86**
(dor documentada no §8 do alkanes-knowledge). Testes vitest = padrão do `subfrost-app`.

Alternativas descartadas: **Rust direto** (paga o pedágio do toolchain 1.86 pra uma ferramenta de
1 tx); **TS + `@magiceden-oss/runestone-lib` npm** (dep externa de rede contra a nota de de-risk do
registry, e a parte Alkanes a gente porta de qualquer jeito).

## 4. Arquitetura — módulos

Projeto em `C:\Alkanes Geral Dev\opreturn-decoder\` (git próprio, Node + TypeScript + vitest).
Cada módulo tem um propósito e é testável isolado.

| Módulo | Responsabilidade | Depende de |
|---|---|---|
| `src/leb128.ts` | Primitivos vindos de `alkanes-rs/ts-sdk/bytes.ts`: `decodeVarInt`, `decipher` (LEB128→`bigint[]`), `pack`/`unpack` (= `split_bytes`/`join_to_bytes`, segmentos de 15 bytes), `fromBuffer`. | — |
| `src/script.ts` | Parse do script OP_RETURN: valida `OP_RETURN(0x6a) OP_13(0x5d)`; concatena os data-pushes → payload bytes. | — |
| `src/runestone.ts` | payload → integers (LEB128) → mapa de tags; extrai o campo **`protocol`** (tag 16383) + pointer/edicts/mint do runestone (completude). | leb128 |
| `src/protostone.ts` | Porte do `Protostone::decipher`: campo `protocol` → `Protostone[]` `{protocolTag, edicts[], pointer, refund, message, burn, from}`. | leb128 |
| `src/cellpack.ts` | bytes da `message` → `Vec<u128>` (LEB128) → `{target:{block,tx}, opcode, inputs[]}`; detecta padding de 15 bytes; flag "é Alkanes". | leb128 |
| `src/burn.ts` | Detecção de burn (ver §6). | — |
| `src/decode.ts` | Orquestrador: entrada → `DecodeResult` estruturado. | todos |
| `src/format.ts` | Saída legível + resumo de 1 linha + **aviso de burn** em destaque. | — |
| `src/fetch.ts` | Resolver `txid → raw hex`, plugável (ver §7). | — |
| `src/cli.ts` | `decode <txid> \| --hex <OP_RETURN_hex> \| --rawtx <hex> [--opreturn-vout N] [--source ...]`. | decode, fetch, format |

## 5. Pipeline de decode (a nível de byte)

1. **Entrada → bytes do OP_RETURN.**
   - `txid`/`--rawtx`: parse da tx Bitcoin → lista de vouts; acha o **índice do vout que é
     OP_RETURN**; pega o `scriptPubKey` dele.
   - `--hex`: já é o script OP_RETURN.
2. **Script → payload** (`script.ts`): exige `0x6a 0x5d` (OP_RETURN + OP_13/MAGIC); concatena os
   data-pushes seguintes num buffer.
3. **Payload → integers** (`runestone.ts`): LEB128 decode → `u128[]`. Tag-parse em pares
   `(tag, value)`; coleta o campo **`protocol`** (todos os valores da tag `16383 = 2^14-1`).
   Também expõe pointer (tag 22), edicts (tag 0/BODY), mint — informativo.
4. **Campo `protocol` → protostones** (`protostone.ts`, porte de `Protostone::decipher`):
   - `join_to_bytes(protocol_values)` reassembla os u128 (15 bytes cada) num buffer.
   - LEB128 decode desse buffer → `u128[]`.
   - Loop: lê `protocol_tag`; se `0`, para; lê `length`; `take_n(length)` valores → `to_fields`
     (mapa por tag) → `from_fields_and_tag`. Tags internas do protostone:
     `POINTER=91, REFUND=93, MESSAGE=81, BURN=83, FROM=95, BODY=0`.
   - Edicts via tag BODY=0 em chunks de 4 `[block, tx, amount, output]` com **delta-encoding**
     do id (`next_protostone_edict_id`: block soma; se block==0, tx soma).
5. **message → cellpack** (`cellpack.ts`): a `message` é `join_to_bytes` dos valores da tag
   MESSAGE → LEB128 decode → `u128[]`. Pela semântica canônica (`Cellpack: TryFrom<Vec<u128>>`):
   `target = [v[0], v[1]]` (block:tx), `inputs = v[2..]`, **opcode = inputs[0]** por convenção.

### 5.1 ⚠️ Padding de 15 bytes (item nº 1 do TDD)

A `message` é empacotada em segmentos de 15 bytes; `join_to_bytes` reconstrói **com zeros de
padding** até o múltiplo de 15. Logo, o cellpack desempacotado **inclui zeros espúrios na cauda**.
Exemplo (a fixture): `message_hex = 02bbde040102000000000000000000` (15 bytes) decodifica em
`[2, 77627, 1, 2, 0,0,0,0,0,0,0,0,0,0]` → `target = 2:77627`, `opcode = 1`, `inputs = [2, 0×9]`.
Os 9 zeros finais são **padding de alinhamento, não inputs reais**.

Estratégia: o `cellpack.ts` produz o `Vec<u128>` **fiel** (bate com o decode do alkanes-rs pro
mesmo hex — critério de aceite 2) **e** anota que a cauda de zeros é padding de 15 bytes; a saída
legível e o resumo de 1 linha usam a forma "limpa" (opcode 1, target 2:77627, input significativo
`[2]`). Os valores exatos da fixture (incl. se a cauda conta como input no ground-truth do
alkanes-rs) são travados no teste contra o hex real, não chutados aqui.

> Nota: o cellpack target da fixture (**2:77627**) é **diferente** do token do edict
> (**2:77087** = o pool DIESEL/frBTC). Coisas distintas — o cellpack chama um contrato; o edict
> move o LP token. O decoder reporta os dois separadamente.

## 6. Detecção de burn (o bug do bond)

Regra: **burn ⟺ `pointer` (ou `refund`) == índice do vout que é o OP_RETURN**. Os alkanes
apontados pra esse vout são queimados (regra "OP_RETURN = burn" do Protocolo/_index).

- Modos `txid` e `--rawtx`: o índice do OP_RETURN é conhecido (parse de vouts) → **detecção
  automática**.
- Modo `--hex` puro: sem layout de vouts. Aceita `--opreturn-vout N` como dica; sem ela, reporta
  os valores de `pointer`/`refund` e avisa: *"pra confirmar burn, passe o txid/--rawtx ou
  --opreturn-vout N"*.
- Quando dispara: aviso em destaque, ex. *"⚠️ pointer (1) aponta pro OP_RETURN (vout 1) → alkanes
  QUEIMADOS."*

## 7. Fonte de dados (raw tx) — resolver plugável

O núcleo é offline; só `txid → raw hex` toca a rede. O raw da tx Bitcoin (que contém o OP_RETURN
inteiro) basta — não precisa do indexador Alkanes pra decodificar.

- **Default:** `mempool.space/api/tx/<txid>/hex` (keyless, zero config).
- **Plugáveis** via `--source` / env: `api.subfrost.io` (gateway `mainnet.subfrost.io/v4/<apikey>`,
  namespaces `esplora_*`/`btc_*`; tratar `-32603` transiente com retry), `api.alkanode.com`.
- **Oráculo de conferência (não fetch):** `espo.sh/tx/<txid>` e `espo.sh/docs` — bater os campos
  do protostone decodificado.
- **CI:** fixtures salvas offline → testes **nunca** tocam a rede.

## 8. Saída esperada (forma)

Por protostone, legível:
- `protocol_tag`, `edicts` (amount, `block:tx`, output), `pointer`, `refund`.
- `message`: hex cru + cellpack desempacotado e rotulado (target `block:tx`, opcode, inputs).
- Resumo de 1 linha, ex.: *"Alkanes call ao 2:77627, opcode 1, com edict de 2 (2:77087) → vout 1."*
- **Aviso de burn** se `pointer`/`refund` cair no OP_RETURN.

Rodar também contra **uma tx saudável** (swap/mint normal) pra contraste.

## 9. Testes (TDD)

Fixtures offline em `test/fixtures/` (`{ rawTxHex, opReturnHex, opReturnVout, expected }`):

- **`bond-burn`** — `b9f28df473ed333f1b20359e8d25d29f8dee0e25004119e9b9fdc21f77e72f5e`. Espera:
  protostone `protocol_tag=1`, `pointer=1`, `refund=0`, edict `2:77087` amount 2 → output 1,
  `message_hex=02bbde0401…`; cellpack desempacotado/rotulado batendo com alkanes-rs; **aviso de
  burn dispara** (pointer 1 → vout do OP_RETURN). Oráculo: espo.sh.
- **`healthy-*`** — uma tx saudável (swap/mint), sem burn, decode correto.

## 10. Critérios de aceite (1:1 com o kickoff)

1. Dado o txid da fixture, reproduz os campos do protostone (edict `2:77087` amount 2 → output 1;
   pointer 1; refund 0; protocol_tag 1; `message_hex 02bbde0401…`).
2. O cellpack do `message_hex` é desempacotado em `Vec<u128>` e rotulado, **batendo com o decode do
   alkanes-rs** pro mesmo hex (incl. tratamento do padding de 15 bytes, §5.1).
3. O **aviso de burn** dispara nessa fixture (pointer → OP_RETURN).
4. Roda também numa tx saudável (sem burn) e mostra o decode correto.
5. Aceita txid, hex cru de OP_RETURN, e raw-tx hex como entrada.

## 11. Riscos / pontos a travar no TDD

- **Padding de 15 bytes no cellpack (§5.1)** — nº 1. Resolver casando com o alkanes-rs pro hex real.
- **Layout exato das tags do Runestone** (POINTER do runestone vs do protostone; o `protocol` é a
  tag 16383) — confirmar contra `ordinals`/decode real na primeira fixture.
- **Delta-encoding de edicts** — `next_protostone_edict_id` (block soma; se block==0, tx soma).
  Validar no edict da fixture.
- **Encontrar uma fixture "saudável"** real de swap/mint Alkanes pra o teste de contraste.
