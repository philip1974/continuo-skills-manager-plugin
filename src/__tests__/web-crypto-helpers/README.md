# web-crypto-helpers

零依赖 Web Crypto wrapper for SHA-256 tree hash。替代 topic-03 用的 `node:crypto.createHash`。

## API
- `digestSha256Hex(bytes: Uint8Array): Promise<string>` — SHA-256 lower-hex
- `concatBytes(parts: Uint8Array[]): Uint8Array` — 字节拼接 (输出 byteOffset === 0)

## Trust 边界
- **关键 P0**: `digest('SHA-256', bytes)` 必须直传 TypedArray view,**不能**用 `bytes.buffer` (view subarray 时会读整个 backing buffer 出错字节)
- byte-identical 与 node:crypto.createHash('sha256').update(buf).digest('hex')
