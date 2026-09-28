import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

dotenv.config({
  path: fileURLToPath(new URL('./.env.local', import.meta.url)),
  quiet: true,
});

export const NETWORK = 'preprod';
export const LOCK_LOVELACE = 10_000_000n;

export function required(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw Error(`Missing ${name}. Configure it in .env.local (see .env.example).`);
  }
  return value;
}

export const BLOCKFROST_API_KEY = required('BLOCKFROST_API_KEY');
if (BLOCKFROST_API_KEY === 'preprod_your_key') {
  throw Error('BLOCKFROST_API_KEY is still the example value. Replace it in .env.local with a valid Preprod Blockfrost project ID.');
}
if (!BLOCKFROST_API_KEY.startsWith('preprod')) {
  throw Error('This demo requires a Preprod Blockfrost API key');
}
