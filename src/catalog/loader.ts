// Fetch, validate, and cache catalog.json through hardcoded allowlist constants.

import {
  CATALOG_HOST_ALLOWLIST,
  CATALOG_MAX_SIZE_BYTES,
  CATALOG_PROTOCOL_ALLOWLIST,
  DEFAULT_CATALOG_URL,
  isPlaceholderCatalogUrl,
} from '../config/catalog-allowlist';
import { co, type CoPluginApp } from '../types/sdk-shim';
import type { CatalogIndex } from '../types/data';
import { assertUrlInAllowlist } from '../util/url-allowlist';

const { z } = co;

const CACHE_KEY_PREFIX = 'catalog:';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CATALOG_URL_CONFIG_KEY = 'config:catalog-url';

const catalogEntrySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  version: z.string().optional(),
  gitUrl: z.string(),
  sha: z.string(),
  hash: z.string(),
  subpath: z.string().optional(),
});

const catalogIndexSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.string(),
  seedPhase: z.boolean().optional(),
  entries: z.array(catalogEntrySchema),
});

export class CatalogTooLargeError extends Error {
  readonly code = 'CATALOG_TOO_LARGE';

  constructor(public readonly sizeBytes: number) {
    super(
      `catalog size ${sizeBytes} bytes exceeds cap ${CATALOG_MAX_SIZE_BYTES} bytes`,
    );
    this.name = 'CatalogTooLargeError';
  }
}

export class CatalogSchemaUnsupportedError extends Error {
  readonly code = 'CATALOG_SCHEMA_UNSUPPORTED';

  constructor(public readonly schemaVersion: unknown) {
    super(
      `catalog schemaVersion ${String(schemaVersion)} unsupported (v0.1 expects 1)`,
    );
    this.name = 'CatalogSchemaUnsupportedError';
  }
}

export class CatalogUrlPlaceholderError extends Error {
  readonly code = 'CATALOG_URL_PLACEHOLDER';

  constructor(public readonly url: string) {
    super('catalog URL is placeholder; configure in Settings tab');
    this.name = 'CatalogUrlPlaceholderError';
  }
}

export interface CatalogCacheEntry {
  fetchedAt: number;
  expiresAt: number;
  index: CatalogIndex;
}

export async function getCatalogUrl(app: CoPluginApp): Promise<string> {
  const stored = await app.dataStore.load();
  const userOverride = stored[CATALOG_URL_CONFIG_KEY];
  if (typeof userOverride === 'string' && userOverride.length > 0) {
    return userOverride;
  }
  return DEFAULT_CATALOG_URL;
}

export async function loadCatalog(
  app: CoPluginApp,
  options?: { forceRefresh?: boolean },
): Promise<CatalogIndex> {
  const url = await getCatalogUrl(app);
  if (isPlaceholderCatalogUrl(url)) {
    throw new CatalogUrlPlaceholderError(url);
  }

  assertUrlInAllowlist(url, {
    protocolAllowlist: CATALOG_PROTOCOL_ALLOWLIST,
    hostAllowlist: CATALOG_HOST_ALLOWLIST,
  });

  const cacheKey = CACHE_KEY_PREFIX + url;
  if (!options?.forceRefresh) {
    const stored = await app.dataStore.load();
    const cached = stored[cacheKey] as CatalogCacheEntry | undefined;
    if (cached && cached.expiresAt > Date.now()) {
      return cached.index;
    }
  }

  const response = await app.network.fetch(url);
  if (!response.ok) {
    throw new Error(`catalog fetch failed: ${response.status} ${response.statusText}`);
  }

  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > CATALOG_MAX_SIZE_BYTES) {
    throw new CatalogTooLargeError(buffer.byteLength);
  }

  const text = new TextDecoder('utf-8', { fatal: true }).decode(
    new Uint8Array(buffer),
  );
  const raw = JSON.parse(text) as { schemaVersion?: unknown };
  if (raw.schemaVersion !== 1) {
    throw new CatalogSchemaUnsupportedError(raw.schemaVersion);
  }
  const parsed = catalogIndexSchema.parse(raw) as CatalogIndex;

  const data = await app.dataStore.load();
  const now = Date.now();
  const cacheEntry: CatalogCacheEntry = {
    fetchedAt: now,
    expiresAt: now + CACHE_TTL_MS,
    index: parsed,
  };
  data[cacheKey] = cacheEntry;
  await app.dataStore.save(data);
  return parsed;
}

export async function setUserCatalogUrlOverride(
  app: CoPluginApp,
  url: string | null,
): Promise<void> {
  const data = await app.dataStore.load();
  if (url === null) {
    delete data[CATALOG_URL_CONFIG_KEY];
  } else {
    data[CATALOG_URL_CONFIG_KEY] = url;
  }
  await app.dataStore.save(data);
}

export { CACHE_KEY_PREFIX, CACHE_TTL_MS, CATALOG_URL_CONFIG_KEY };
