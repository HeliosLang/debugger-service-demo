# Debugger service demo

Multi-file `time_lock.hl` / `asset_search.hl` from the VS Code plugin examples, compiled with `hl2ts --project helios_demo`. Uses released `@helios-lang/tx-utils` **0.6.41** on **Preprod**.

```sh
npm ci
helios login
npm run compile
npm run check
npm run status
```

`npm run check` builds and signs a lock, verifies early unlock fails with all three CBOR arguments and both source files captured, and builds/signs owner cancellation. It uses synthetic UTxOs and intercepts uploads locally; it submits nothing.

## Wallets

Wallet phrases and the Blockfrost API key are loaded by `dotenv` from ignored `.env.local`. Copy `.env.example` for a fresh setup, then set `OWNER_PHRASE`, `BENEFICIARY_PHRASE`, and `BLOCKFROST_API_KEY` to a real Preprod Blockfrost project ID. The example value `preprod_your_key` cannot authenticate. The existing funded wallets are already configured; do not replace their phrases.

Generate a new recovery phrase with `helios wallet create --network preprod`, then paste its `phrase` into `.env.local`. Until the CLI wallet command is published, use `node ../contract-utils/src/helios.mjs wallet create --network preprod`. To save the output privately instead of printing it, add `--out wallet.json`.

Wallet generation is offline. Fund the owner address printed by `npm run status` with about 50 tADA. The beneficiary does not need funds for the early unlock demonstration. The owner wallet supplies a separate ADA-only UTxO as script collateral; transaction fees come from the escrowed amount. Configure a valid Blockfrost key in `.env.local`; no wallet phrase or Blockfrost key is hardcoded in source files.

## Funded walkthrough

```sh
npm run status
npm run lock
# Wait until the lock transaction is confirmed/indexed by Blockfrost.
npm run unlock -- <lock-transaction-id-printed-by-lock>
```

`lock` locks 10 tADA for 24 hours. You can create multiple locks. Keep each printed transaction ID to unlock or cancel that specific lock; the scripts read its output and deadline from the chain. If submission fails, check the transaction on Preprod before retrying.

`unlock` takes the lock transaction ID, finds its unspent validator output, and checks that the inline datum names the configured owner and beneficiary. It uses only that escrowed output as a normal input, with an owner wallet UTxO reserved for collateral. It deliberately selects a validity start before the deadline, fails with **time lock not yet expired**, and submits no transaction. The builder automatically uploads using the generated bundle's debugger metadata. The script verifies a matching capture is retrievable and saves it to `private/failed-capture.json`. The Console project detail page shows the stored validator arguments.

The unchanged example also requires an asset for successful `Unlock`; this walkthrough deliberately tests early failure. Use the owner's `Cancel` branch to recover funds:

```sh
npm run cancel -- <lock-transaction-id>
```

Cancel spends the script output back to the owner, minus fees. Funding and submission require working Preprod connectivity. All transactions here use test ADA.

`dist/` contains the debugger API key and is ignored, as are `.env.local` and downloaded captures. Regenerate the bundle after project-key rotation. Do not print or commit these files.

## Verified Preprod run

On 2026-09-27, both wallets received 50 tADA. The owner successfully locked 10 tADA in transaction `a98c1356451d031e0f79066947331ef73c45fef87af57d0c391cea53adb59be2`. Early unlock failed without submission; capture `ce937e2e-7251-458d-844a-04685a9c79e2` was retrieved from the hosted debugger API and saved privately. Both original source files and all three argument CBOR values are included. Funds remain locked and can be recovered using `npm run cancel -- a98c1356451d031e0f79066947331ef73c45fef87af57d0c391cea53adb59be2`.
