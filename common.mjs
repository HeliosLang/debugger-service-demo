import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import {
  makeBlockfrostV0Client,
  restoreRootPrivateKey,
  makeSimpleWallet,
  makeTxBuilder,
} from '@helios-lang/tx-utils';
import { makeContractContextBuilder } from '@helios-lang/contract-utils';
import {
  makeShelleyAddress,
  makeTxInput,
  makeTxOutput,
  makeTxOutputId,
} from '@helios-lang/ledger';
import { NETWORK, BLOCKFROST_API_KEY, LOCK_LOVELACE, required } from './config.mjs';
import * as bundle from './generated/index.js';

export const client = makeBlockfrostV0Client(NETWORK, BLOCKFROST_API_KEY);

const privateDir = new URL('./private/', import.meta.url);
mkdirSync(privateDir, { recursive: true, mode: 0o700 });

export function wallet(role) {
  const phrase = required(`${role.toUpperCase()}_PHRASE`);
  return makeSimpleWallet(restoreRootPrivateKey(phrase.split(/\s+/)), client);
}

export const owner = wallet('owner');
export const beneficiary = wallet('beneficiary');
export const contract = makeContractContextBuilder()
  .with(bundle.time_lock)
  .build({ isMainnet: false });
export const address = makeShelleyAddress(false, contract.time_lock.$hash);

export const stateFile = new URL('./private/lock.json', import.meta.url);
export const readState = () => JSON.parse(readFileSync(stateFile, 'utf8'));
export const writeState = (state) =>
  writeFileSync(stateFile, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });

export const datum = (until) => ({
  lock_until: until,
  owner: owner.spendingPubKeyHash,
  beneficiary: beneficiary.spendingPubKeyHash,
});

export function lockBuilder(until) {
  return makeTxBuilder({ isMainnet: false }).payWithDatum(address, LOCK_LOVELACE, {
    inline: datum(until),
  });
}

export function spendBuilder(input, until, cancel = false) {
  return makeTxBuilder({ isMainnet: false })
    .spendWithRedeemer(input, cancel ? { Cancel: {} } : { Unlock: {} })
    .addSigners((cancel ? owner : beneficiary).spendingPubKeyHash)
    .validFromTime(Math.min(Date.now() - 60_000, until - 60_000))
    .validToTime(Date.now() + 600_000);
}

export async function lockedInput() {
  const state = readState();
  const input = await client.getUtxo(makeTxOutputId(state.outputId));
  // Restore the typed contract context after decoding the on-chain UTxO.
  return {
    state,
    input: makeTxInput(
      input.id,
      makeTxOutput(address, input.output.value, input.output.datum),
    ),
  };
}

export async function submit(tx, wallet) {
  tx.addSignatures(await wallet.signTx(tx));
  return (await client.submitTx(tx)).toHex();
}

export async function captures() {
  const response = await fetch(`${bundle.$debugger.endpoint}/v1/captures`, {
    headers: { Authorization: `Bearer ${bundle.$debugger.apiKey}` },
  });
  if (!response.ok) {
    throw Error(`Capture feed HTTP ${response.status}`);
  }
  return response.json();
}

export { bundle, LOCK_LOVELACE };
