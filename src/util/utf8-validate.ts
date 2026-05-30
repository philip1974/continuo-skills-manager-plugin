// Strict UTF-8 decode with explicit BOM strip and optional Unicode normalization.

export class BinaryBlobRejectedError extends Error {
  readonly code = 'BINARY_BLOB_REJECTED';

  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'BinaryBlobRejectedError';
  }
}

const BOM_UTF8 = [0xef, 0xbb, 0xbf] as const;

export function decodeUtf8Strict(
  bytes: Uint8Array,
  opts?: { stripBom?: boolean; normalize?: 'NFC' | 'NFD' | 'none' },
): string {
  const stripBom = opts?.stripBom ?? true;
  const normalize = opts?.normalize ?? 'NFC';
  let view = bytes;

  if (
    stripBom &&
    view.length >= 3 &&
    view[0] === BOM_UTF8[0] &&
    view[1] === BOM_UTF8[1] &&
    view[2] === BOM_UTF8[2]
  ) {
    view = bytes.subarray(3);
  }

  let value: string;
  try {
    value = new TextDecoder('utf-8', {
      fatal: true,
      ignoreBOM: !stripBom,
    }).decode(view);
  } catch (err) {
    throw new BinaryBlobRejectedError(
      `non-UTF-8 byte sequence: ${(err as Error).message}`,
      err,
    );
  }

  if (normalize !== 'none') value = value.normalize(normalize);
  return value;
}
