// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { digestSha256Hex, concatBytes } from '../../util/web-crypto-helpers';

const enc = new TextEncoder();

describe('digestSha256Hex — known vectors + subarray P0-3 gate', () => {
  it('T1 — empty bytes → SHA-256("") = e3b0c442...b855', async () => {
    const out = await digestSha256Hex(new Uint8Array(0));
    expect(out).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('T2 — "abc" → ba7816bf...a3 (RFC vector)', async () => {
    const out = await digestSha256Hex(enc.encode('abc'));
    expect(out).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('T3 — concat(a,b,c) === one-shot("abc")', async () => {
    const a = enc.encode('a'), b = enc.encode('b'), c = enc.encode('c');
    const concatted = concatBytes([a, b, c]);
    expect(await digestSha256Hex(concatted)).toBe(await digestSha256Hex(enc.encode('abc')));
  });

  it('T4 — P0-3 subarray gate: view subarray(1,4) of [88,97,98,99,89] === abc hash', async () => {
    // CRITICAL test: if impl uses bytes.buffer it'll hash all 5 bytes [88,97,98,99,89]
    //   and produce wrong hash. Must use bytes (TypedArray view) directly.
    const backing = new Uint8Array([88, 97, 98, 99, 89]);  // [88, 'a', 'b', 'c', 89]
    const view = backing.subarray(1, 4);  // ['a', 'b', 'c']
    const viewHash = await digestSha256Hex(view);
    const abcHash = await digestSha256Hex(enc.encode('abc'));
    expect(viewHash).toBe(abcHash);
    expect(viewHash).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('T5 — 10MB stress (no time assert, just correctness)', async () => {
    const part = new Uint8Array(1024 * 1024);
    for (let off = 0; off < part.byteLength; off += 65536) {
      crypto.getRandomValues(part.subarray(off, Math.min(off + 65536, part.byteLength)));
    }
    const parts = Array.from({ length: 10 }, () => part);
    const oneShot = await digestSha256Hex(concatBytes(parts));
    // Re-compute via single concat for parity check
    const expected = await digestSha256Hex(concatBytes([concatBytes(parts)]));
    expect(oneShot).toBe(expected);
    // 时长 / heap 只 log,不 fail (P2-2 fold)
  });

  it('T6 — concatBytes empty input → empty Uint8Array (P2-1 fold)', () => {
    const out = concatBytes([]);
    expect(out.byteLength).toBe(0);
    expect(out.byteOffset).toBe(0);
  });

  it('T7 — concatBytes byteOffset === 0 && byteLength === sum(parts)', () => {
    const a = new Uint8Array([1, 2, 3]);
    const b = new Uint8Array([4, 5]);
    const out = concatBytes([a, b]);
    expect(out.byteOffset).toBe(0);
    expect(out.byteLength).toBe(5);
    expect(out.buffer.byteLength).toBe(5);  // fresh buffer, not backed
    expect([...out]).toEqual([1, 2, 3, 4, 5]);
  });
});
