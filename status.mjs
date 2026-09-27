import { owner, beneficiary, client, address } from './common.mjs';

for (const [name, wallet] of Object.entries({ owner, beneficiary })) {
  console.log(`${name}: ${wallet.address.toBech32()}`);
  const utxos = await client.getUtxos(wallet.address);
  console.log(
    `  ${utxos.length} UTxOs; ${
      Number(utxos.reduce((sum, utxo) => sum + utxo.output.value.lovelace, 0n)) / 1e6
    } tADA`,
  );
}

console.log(`Validator: ${address.toBech32()}`);
