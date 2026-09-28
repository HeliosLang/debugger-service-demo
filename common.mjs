import { mkdirSync } from 'node:fs';
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
} from '@helios-lang/ledger';
import { NETWORK, BLOCKFROST_API_KEY, LOCK_LOVELACE, required } from './config.mjs';
import * as bundle from './dist/index.js';

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

export function selectLockedInput(utxos, txId) {
  if (!/^[0-9a-fA-F]{64}$/.test(txId)) {
    throw Error('Lock transaction ID must be 64 hexadecimal characters');
  }
  const datumCast = contract.time_lock.Datum;
  const matching = utxos.filter((utxo) => {
    if (utxo.id.txId.toHex() !== txId.toLowerCase()) return false;
    if (utxo.output.datum?.kind !== 'InlineTxOutputDatum') return false;
    try {
      const decoded = datumCast.fromUplcData(utxo.output.datum.data);
      return (
        decoded.owner.toHex() === owner.spendingPubKeyHash.toHex() &&
        decoded.beneficiary.toHex() === beneficiary.spendingPubKeyHash.toHex()
      );
    } catch {
      return false;
    }
  });
  if (matching.length !== 1) {
    throw Error(`Expected one unspent lock for this owner and beneficiary in ${txId}; found ${matching.length}`);
  }
  const input = matching[0];
  const decoded = datumCast.fromUplcData(input.output.datum.data);
  const state = {
    txId: txId.toLowerCase(),
    outputId: input.id.toString(),
    lockUntil: decoded.lock_until,
  };
  return { state, input };
}

export async function lockedInput(txId) {
  const { state, input } = selectLockedInput(
    await client.getUtxos(address),
    txId,
  );
  // Restore the typed contract context after decoding the on-chain UTxO.
  return {
    state,
    input: makeTxInput(
      input.id,
      makeTxOutput(address, input.output.value, input.output.datum),
    ),
  };
}

export function ownerCollateral(utxos) {
  const candidates = utxos.filter(
    (utxo) => utxo.address.isEqual(owner.address) && utxo.value.assets.isZero(),
  );
  if (!candidates.length) {
    throw Error('Owner wallet needs an ADA-only UTxO for script collateral');
  }
  return candidates.reduce((largest, utxo) =>
    utxo.value.lovelace > largest.value.lovelace ? utxo : largest,
  );
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
