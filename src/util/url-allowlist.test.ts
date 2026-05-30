import { describe, expect, it } from 'vitest';
import { assertUrlInAllowlist, UrlNotAllowedError } from './url-allowlist';

const options = {
  protocolAllowlist: ['https:'],
  hostAllowlist: ['raw.githubusercontent.com', 'github.com'],
};

describe('assertUrlInAllowlist', () => {
  it('accepts an allowlisted raw GitHub URL', () => {
    const url = assertUrlInAllowlist(
      'https://raw.githubusercontent.com/philip1974/repo/main/catalog.json',
      options,
    );
    expect(url.hostname).toBe('raw.githubusercontent.com');
  });

  it('rejects http URLs', () => {
    expect(() => assertUrlInAllowlist('http://github.com/a/b', options)).toThrow(
      UrlNotAllowedError,
    );
  });

  it('rejects ftp URLs', () => {
    expect(() => assertUrlInAllowlist('ftp://github.com/a/b', options)).toThrow(
      /protocol ftp: not allowed/,
    );
  });

  it('rejects non-GitHub hosts', () => {
    expect(() => assertUrlInAllowlist('https://example.com/catalog.json', options)).toThrow(
      /host example.com not allowed/,
    );
  });

  it('accepts github.com URLs', () => {
    const url = assertUrlInAllowlist('https://github.com/philip1974/repo', options);
    expect(url.hostname).toBe('github.com');
  });

  it('enforces exact URL matches', () => {
    const exact =
      'https://raw.githubusercontent.com/philip1974/continuo-skills-catalog/main/catalog.json';
    expect(
      assertUrlInAllowlist(exact, {
        ...options,
        exactUrlAllowlist: [exact],
      }).href,
    ).toBe(exact);
  });

  it('rejects exact URL mismatches', () => {
    expect(() =>
      assertUrlInAllowlist('https://github.com/philip1974/repo', {
        ...options,
        exactUrlAllowlist: ['https://github.com/philip1974/other'],
      }),
    ).toThrow(/exactUrlAllowlist/);
  });

  it('rejects invalid URL strings', () => {
    expect(() => assertUrlInAllowlist('not a url', options)).toThrow(
      UrlNotAllowedError,
    );
  });
});
