import { owner, client, lockedInput, spendBuilder, submit, writeState } from './common.mjs';

const { state, input } = await lockedInput();
const tx = await spendBuilder(input, state.lockUntil, true).build({
  changeAddress: owner.address,
  spareUtxos: await owner.utxos,
  networkParams: await client.parameters,
});
const id = await submit(tx, owner);
writeState({ ...state, cancelTxId: id });
console.log(`Owner recovered locked funds: ${id}`);
