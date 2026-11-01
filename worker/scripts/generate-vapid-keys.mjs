// Generates the VAPID keypair that lets the worker prove it is allowed to push to your browser.
//
//   npm run keys
//
// The PUBLIC key goes in two places (it is not secret):
//   - worker/wrangler.toml  -> VAPID_PUBLIC_KEY
//   - .env.production       -> VITE_VAPID_PUBLIC_KEY
// The PRIVATE key is a secret. Give it to Cloudflare and nowhere else:
//   npx wrangler secret put VAPID_PRIVATE_KEY
// Never commit it. Keep a copy in a password manager; if you lose it, generate a new pair
// (browsers will simply re-subscribe).

import { generateKeyPairSync } from 'node:crypto';

const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const publicJwk = publicKey.export({ format: 'jwk' });
const privateJwk = privateKey.export({ format: 'jwk' });

const toBuffer = value => Buffer.from(value, 'base64url');
// Uncompressed EC point: 0x04 || x || y
const publicRaw = Buffer.concat([Buffer.from([4]), toBuffer(publicJwk.x), toBuffer(publicJwk.y)]).toString('base64url');

console.log('PUBLIC key (safe to commit):');
console.log(publicRaw);
console.log('');
console.log('PRIVATE key (secret, do not commit or share):');
console.log(privateJwk.d);
