import { describe, expect, it } from 'vitest';
import {
  CATALOG_HOST_ALLOWLIST,
  CATALOG_MAX_SIZE_BYTES,
  CATALOG_PROTOCOL_ALLOWLIST,
  DEFAULT_CATALOG_URL,
  isPlaceholderCatalogUrl,
} from './catalog-allowlist';

describe('catalog allowlist constants', () => {
  it('freezes allowlist constants', () => {
    expect(Object.isFrozen(CATALOG_HOST_ALLOWLIST)).toBe(true);
    expect(Object.isFrozen(CATALOG_PROTOCOL_ALLOWLIST)).toBe(true);
  });

  it('uses a non-placeholder default catalog URL', () => {
    expect(DEFAULT_CATALOG_URL).toContain('philip1974');
    expect(isPlaceholderCatalogUrl(DEFAULT_CATALOG_URL)).toBe(false);
  });

  it('detects TBD org placeholders', () => {
    expect(isPlaceholderCatalogUrl('https://raw.githubusercontent.com/{TBD-org}/catalog.json')).toBe(true);
  });

  it('detects TBD user placeholders', () => {
    expect(isPlaceholderCatalogUrl('https://raw.githubusercontent.com/{TBD-USER}/catalog.json')).toBe(true);
  });

  it('does not flag a valid catalog URL', () => {
    expect(
      isPlaceholderCatalogUrl(
        'https://raw.githubusercontent.com/philip1974/continuo-skills-catalog/main/catalog.json',
      ),
    ).toBe(false);
  });

  it('caps catalog size at 1MB', () => {
    expect(CATALOG_MAX_SIZE_BYTES).toBe(1 * 1024 * 1024);
  });
});
