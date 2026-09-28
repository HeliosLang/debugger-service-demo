import { owner, client, lockedInput, spendBuilder, submit } from './common.mjs';

const txId = process.argv[2];
if (!txId || process.argv.length !== 3) {
  throw Error('Usage: npm run cancel -- <lock-transaction-id>');
}

const { state, input } = await lockedInput(txId);
const tx = await spendBuilder(input, state.lockUntil, true).build({
  changeAddress: owner.address,
  spareUtxos: await owner.utxos,
  networkParams: await client.parameters,
});
const id = await submit(tx, owner);
console.log(`Owner recovered locked funds: ${id}`);
