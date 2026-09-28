import assert from 'node:assert/strict';
import { makeTxInput, makeTxOutput, makeInlineTxOutputDatum, DEFAULT_NETWORK_PARAMS } from '@helios-lang/ledger';
import { owner, beneficiary, contract, lockBuilder, spendBuilder, ownerCollateral, selectLockedInput, address, bundle } from './common.mjs';

assert.equal(bundle.$debugger.name, 'helios_demo');

const funds = (wallet) => [
  makeTxInput('11'.repeat(32) + '#0', makeTxOutput(wallet.address, 50_000_000n)),
  makeTxInput('22'.repeat(32) + '#0', makeTxOutput(wallet.address, 10_000_000n)),
];
const until = Date.now() + 86_400_000;
const params = DEFAULT_NETWORK_PARAMS();
const lock = await lockBuilder(until).build({
  changeAddress: owner.address,
  spareUtxos: funds(owner),
  networkParams: params,
});
lock.addSignatures(await owner.signTx(lock));
const index = lock.body.outputs.findIndex((output) => output.address.isEqual(address));
const input = makeTxInput(`${lock.id().toHex()}#${index}`, lock.body.outputs[index]);
const otherLock = await lockBuilder(until).build({
  changeAddress: owner.address,
  spareUtxos: [makeTxInput('33'.repeat(32) + '#0', makeTxOutput(owner.address, 50_000_000n))],
  networkParams: params,
});
const otherIndex = otherLock.body.outputs.findIndex((output) => output.address.isEqual(address));
const otherInput = makeTxInput(`${otherLock.id().toHex()}#${otherIndex}`, otherLock.body.outputs[otherIndex]);
assert.equal(selectLockedInput([otherInput, input], lock.id().toHex()).input.id.toString(), input.id.toString());
assert.throws(() => selectLockedInput([otherInput], lock.id().toHex()), /found 0/);
const foreign = makeTxInput(
  input.id,
  makeTxOutput(address, input.value, makeInlineTxOutputDatum(contract.time_lock.Datum.toUplcData({
    lock_until: until,
    owner: beneficiary.spendingPubKeyHash,
    beneficiary: beneficiary.spendingPubKeyHash,
  }))),
);
assert.throws(() => selectLockedInput([foreign], lock.id().toHex()), /found 0/);

const previous = globalThis.fetch;
const captures = [];
globalThis.fetch = async (url, options) => {
  assert.equal(String(url), `${bundle.$debugger.endpoint}/v1/captures`);
  assert.equal(options.headers.Authorization, `Bearer ${bundle.$debugger.apiKey}`);
  captures.push(JSON.parse(options.body));
  return Response.json({});
};

try {
  await assert.rejects(
    spendBuilder(input, until).addCollateral(ownerCollateral(funds(owner))).build({
      changeAddress: beneficiary.address,
      spareUtxos: [],
      networkParams: params,
    }),
    /time lock not yet expired/,
  );
  assert.equal(captures.length, 1);
  assert.ok(captures[0].sources.time_lock);
  assert.ok(captures[0].sources.asset_search);
  assert.equal(captures[0].evaluations[0].arguments.length, 3);

  const cancel = await spendBuilder(input, until, true).build({
    changeAddress: owner.address,
    spareUtxos: funds(owner),
    networkParams: params,
  });
  cancel.addSignatures(await owner.signTx(cancel));

  console.log(
    'PASS: lock builds/signs, early unlock fails and captures all three CBOR arguments plus both source files, owner cancel builds/signs. No network submission or capture upload.',
  );
  console.log('Source map names:', captures[0].evaluations[0].sourceMap.sourceNames);
} finally {
  globalThis.fetch = previous;
}
