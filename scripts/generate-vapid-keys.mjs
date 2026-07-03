#!/usr/bin/env node
import { generateKeyPair, exportJWK, base64url } from 'jose'

const { publicKey, privateKey } = await generateKeyPair('ES256', { crv: 'P-256', extractable: true })
const publicJwk = await exportJWK(publicKey)
const privateJwk = await exportJWK(privateKey)

const xBytes = base64url.decode(publicJwk.x)
const yBytes = base64url.decode(publicJwk.y)
const uncompressed = new Uint8Array(1 + xBytes.length + yBytes.length)
uncompressed[0] = 0x04
uncompressed.set(xBytes, 1)
uncompressed.set(yBytes, 1 + xBytes.length)

console.log(`VAPID_PUBLIC_KEY="${base64url.encode(uncompressed)}"`)
console.log(`VAPID_PRIVATE_KEY='${JSON.stringify(privateJwk)}'`)
