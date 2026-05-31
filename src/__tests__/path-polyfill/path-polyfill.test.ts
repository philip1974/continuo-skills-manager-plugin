// @vitest-environment node — needed for node:path.posix import (parity oracle)
import { describe, it, expect } from 'vitest';
import { basename, dirname, normalize, join, sep } from '../../util/path-polyfill';

const nodePath = await import('node:path');

// mulberry32 deterministic PRNG (P2-1 fold)
function mulberry32(seed: number) {
  let t = seed;
  return () => {
    t = (t + 0x6D2B79F5) | 0;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

const HAPPY = ['/x/y/z', '/x/y/z/', '/', '', '/x/../y', '/../../etc', 'x//y//z', 'x/./y'];
const JOIN_TABLE: Array<[string[], string]> = [
  [['/x', '/y/', 'z/'], nodePath.posix.join('/x', '/y/', 'z/')],
  [['/x', '..', 'y'], nodePath.posix.join('/x', '..', 'y')],
  [['', '', 'x'], nodePath.posix.join('', '', 'x')],
  [['/'], nodePath.posix.join('/')],
  [['/x/', '/y'], nodePath.posix.join('/x/', '/y')],
];

describe('path-polyfill — node:path.posix parity', () => {
  for (const input of HAPPY) {
    it(`basename(${JSON.stringify(input)})`, () => {
      expect(basename(input)).toBe(nodePath.posix.basename(input));
    });
    it(`dirname(${JSON.stringify(input)})`, () => {
      expect(dirname(input)).toBe(nodePath.posix.dirname(input));
    });
    it(`normalize(${JSON.stringify(input)})`, () => {
      expect(normalize(input)).toBe(nodePath.posix.normalize(input));
    });
  }

  for (const [parts, expected] of JOIN_TABLE) {
    it(`join(${JSON.stringify(parts)}) === ${JSON.stringify(expected)}`, () => {
      expect(join(...parts)).toBe(expected);
    });
  }

  it('sep === "/" === posix.sep', () => {
    expect(sep).toBe('/');
    expect(sep).toBe(nodePath.posix.sep);
  });

  it('fuzz: 100 random tuples (seeded mulberry32 0xC0FFEE) — polyfill === posix.X', () => {
    const random = mulberry32(0xC0FFEE);
    const SEGMENTS = ['', '.', '..', 'x', 'y', 'z', 'a/b', 'c/'];
    for (let i = 0; i < 100; i++) {
      const n = 1 + Math.floor(random() * 8);
      const parts: string[] = Array.from({ length: n }, () => SEGMENTS[Math.floor(random() * SEGMENTS.length)]!);
      expect(join(...parts)).toBe(nodePath.posix.join(...parts));
      const single = parts.join('/');
      expect(normalize(single)).toBe(nodePath.posix.normalize(single));
      expect(basename(single)).toBe(nodePath.posix.basename(single));
      expect(dirname(single)).toBe(nodePath.posix.dirname(single));
    }
  });
});
