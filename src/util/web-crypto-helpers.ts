// Zero-dep Web Crypto SHA-256 helper (topic-05 replacement for node:crypto.createHash).
//
// CRITICAL P0-3: digest('SHA-256', bytes) MUST pass the TypedArray view directly.
// Passing bytes.buffer would hash the entire backing buffer, ignoring subarray view bounds.

export async function digestSha256Hex(bytes: Uint8Array): Promise<string> {
  // Pass `bytes` (TypedArray view) directly - SubtleCrypto reads view.byteLength
  // from view.byteOffset, respecting subarray semantics.
  const digestBuf = await crypto.subtle.digest(
    'SHA-256',
    bytes as unknown as BufferSource,
  );
  const arr = new Uint8Array(digestBuf);
  let hex = '';
  for (let i = 0; i < arr.length; i++) {
    hex += arr[i]!.toString(16).padStart(2, '0');
  }
  return hex;
}

export function concatBytes(parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const p of parts) total += p.byteLength;
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.byteLength;
  }
  return out;
}

export function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder('utf-8').decode(bytes);
}
