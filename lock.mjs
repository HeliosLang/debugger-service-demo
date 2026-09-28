import {
  owner,
  client,
  lockBuilder,
  submit,
  address,
} from './common.mjs';

// 24 hours, to make sure second script fails
const until = Date.now() + 24 * 60 * 60 * 1000;

const tx = await lockBuilder(until).build({
  changeAddress: owner.address,
  spareUtxos: await owner.utxos,
  networkParams: await client.parameters,
})

const index = tx.body.outputs.findIndex((output) => output.address.isEqual(address))

if (index < 0) {
  throw Error('Missing lock output');
}

const txId = tx.id().toHex()

await submit(tx, owner)

console.log(`Locked 10 tADA: ${txId}\nUnlock time: ${new Date(until).toISOString()}`);
