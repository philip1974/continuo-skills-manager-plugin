// Hardcoded source constants. Do not move these into manifest extension fields.

export const DEFAULT_CATALOG_URL =
  'https://raw.githubusercontent.com/philip1974/continuo-skills-catalog/main/catalog.json';

export const CATALOG_HOST_ALLOWLIST: readonly string[] = Object.freeze([
  'raw.githubusercontent.com',
  'github.com',
]);

export const CATALOG_PROTOCOL_ALLOWLIST: readonly string[] = Object.freeze([
  'https:',
]);

export const CATALOG_MAX_SIZE_BYTES = 1 * 1024 * 1024;

export function isPlaceholderCatalogUrl(url: string): boolean {
  return url.includes('{TBD-org}') || url.includes('{TBD-USER}');
}
