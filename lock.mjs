import { existsSync } from 'node:fs';
import {
  owner,
  client,
  lockBuilder,
  stateFile,
  writeState,
  submit,
  address,
} from './common.mjs';

if (existsSync(stateFile)) {
  throw Error('A lock is already recorded. Use cancel.mjs to recover it before creating another.');
}

const until = Date.now() + 24 * 60 * 60 * 1000;
const tx = await lockBuilder(until).build({
  changeAddress: owner.address,
  spareUtxos: await owner.utxos,
  networkParams: await client.parameters,
});
const index = tx.body.outputs.findIndex((output) => output.address.isEqual(address));
if (index < 0) {
  throw Error('Missing lock output');
}

// Keep recovery information even if submission succeeds but its response is lost.
const txId = tx.id().toHex();
writeState({ txId, outputId: `${txId}#${index}`, lockUntil: until, submitted: false });
await submit(tx, owner);
writeState({ txId, outputId: `${txId}#${index}`, lockUntil: until, submitted: true });

console.log(`Locked 10 tADA: ${txId}\nUnlock time: ${new Date(until).toISOString()}`);
