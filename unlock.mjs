import { writeFileSync } from 'node:fs';
import { beneficiary, client, lockedInput, spendBuilder, captures, bundle } from './common.mjs';

const before = await captures();
const { state, input } = await lockedInput();
let failure;
try {
  await spendBuilder(input, state.lockUntil).build({
    changeAddress: beneficiary.address,
    spareUtxos: await beneficiary.utxos,
    networkParams: await client.parameters,
  });
} catch (error) {
  failure = error;
}
if (!failure || !String(failure).includes('time lock not yet expired')) {
  throw failure ?? Error('Expected early-unlock failure, but build succeeded');
}

console.log('Expected failure: time lock not yet expired. No transaction submitted.');

let found;
for (let attempt = 0; attempt < 6 && !found; attempt++) {
  const response = await fetch(
    `${bundle.$debugger.endpoint}/v1/captures?cursor=${before.cursor}`,
    { headers: { Authorization: `Bearer ${bundle.$debugger.apiKey}` } },
  );
  if (!response.ok) {
    throw Error(`Capture feed HTTP ${response.status}`);
  }

  for (const entry of (await response.json()).captures) {
    const captureResponse = await fetch(
      `${bundle.$debugger.endpoint}/v1/captures/${entry.captureId}`,
      { headers: { Authorization: `Bearer ${bundle.$debugger.apiKey}` } },
    );
    if (!captureResponse.ok) {
      throw Error(`Capture retrieval HTTP ${captureResponse.status}`);
    }

    const payload = await captureResponse.json();
    if (
      String(payload.error?.message ?? payload.error ?? '').includes('time lock not yet expired') &&
      payload.evaluations.some(
        (evaluation) => evaluation.scriptHash === input.output.address.spendingCredential.toHex(),
      )
    ) {
      found = payload;
      break;
    }
  }

  if (!found) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

if (!found) {
  throw Error(
    'Expected failure occurred, but no matching uploaded capture was found. Check the debugger service before repeating.',
  );
}

writeFileSync(
  new URL('./private/failed-capture.json', import.meta.url),
  JSON.stringify(found, null, 2),
  { mode: 0o600 },
);
console.log(`Verified stored capture: ${found.captureId} (${found.evaluations.length} evaluations)`);
