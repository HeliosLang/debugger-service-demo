import assert from 'node:assert/strict';
import { makeTxInput, makeTxOutput, DEFAULT_NETWORK_PARAMS } from '@helios-lang/ledger';
import { owner, beneficiary, lockBuilder, spendBuilder, address, bundle } from './common.mjs';

assert.equal(bundle.$debugger.name, 'catalyst_time_lock');

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
    spendBuilder(input, until).build({
      changeAddress: beneficiary.address,
      spareUtxos: funds(beneficiary),
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
