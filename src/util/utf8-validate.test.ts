import { describe, expect, it } from 'vitest';
import { BinaryBlobRejectedError, decodeUtf8Strict } from './utf8-validate';

const encoder = new TextEncoder();

describe('decodeUtf8Strict', () => {
  it('decodes valid ASCII', () => {
    expect(decodeUtf8Strict(encoder.encode('SKILL.md'))).toBe('SKILL.md');
  });

  it('decodes valid UTF-8 emoji', () => {
    expect(decodeUtf8Strict(encoder.encode('ok 😀'))).toBe('ok 😀');
  });

  it('strips UTF-8 BOM by default', () => {
    expect(decodeUtf8Strict(Uint8Array.from([0xef, 0xbb, 0xbf, 0x61]))).toBe('a');
  });

  it('preserves BOM when stripBom is false', () => {
    expect(
      decodeUtf8Strict(Uint8Array.from([0xef, 0xbb, 0xbf, 0x61]), {
        stripBom: false,
      }),
    ).toBe('\uFEFFa');
  });

  it('rejects invalid bytes', () => {
    expect(() => decodeUtf8Strict(Uint8Array.from([0xff, 0xfe]))).toThrow(
      BinaryBlobRejectedError,
    );
  });

  it('normalizes to NFC by default', () => {
    expect(decodeUtf8Strict(encoder.encode('e\u0301'))).toBe('\u00e9');
  });

  it('normalizes to NFD when requested', () => {
    expect(decodeUtf8Strict(encoder.encode('\u00e9'), { normalize: 'NFD' })).toBe(
      'e\u0301',
    );
  });

  it('preserves normalization when requested', () => {
    expect(decodeUtf8Strict(encoder.encode('e\u0301'), { normalize: 'none' })).toBe(
      'e\u0301',
    );
  });

  it('accepts empty input', () => {
    expect(decodeUtf8Strict(new Uint8Array())).toBe('');
  });

  it('decodes Chinese characters', () => {
    expect(decodeUtf8Strict(encoder.encode('技能'))).toBe('技能');
  });
});
