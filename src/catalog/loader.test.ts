import { describe, expect, it, vi } from 'vitest';
import {
  CATALOG_MAX_SIZE_BYTES,
  DEFAULT_CATALOG_URL,
} from '../config/catalog-allowlist';
import type { CoPluginApp } from '../types/sdk-shim';
import { UrlNotAllowedError } from '../util/url-allowlist';
import {
  CACHE_KEY_PREFIX,
  CACHE_TTL_MS,
  CATALOG_URL_CONFIG_KEY,
  CatalogSchemaUnsupportedError,
  CatalogTooLargeError,
  CatalogUrlPlaceholderError,
  getCatalogUrl,
  loadCatalog,
  setUserCatalogUrlOverride,
} from './loader';

function catalog(schemaVersion = 1) {
  return {
    schemaVersion,
    generatedAt: '2026-05-30T12:05:00+09:00',
    entries: [
      {
        id: 'skill',
        name: 'Skill',
        gitUrl: 'https://github.com/philip1974/repo',
        sha: '0'.repeat(40),
        hash: 'TBD-AT-OP6',
      },
    ],
  };
}

function responseFromBytes(bytes: Uint8Array, init?: ResponseInit): Response {
  return new Response(bytes, {
    status: init?.status ?? 200,
    statusText: init?.statusText ?? 'OK',
  });
}

function responseFromJson(value: unknown): Response {
  return responseFromBytes(new TextEncoder().encode(JSON.stringify(value)));
}

function makeApp(opts?: {
  data?: Record<string, unknown>;
  response?: Response;
}): CoPluginApp {
  const data = opts?.data ?? {};
  return {
    dataStore: {
      load: vi.fn(async () => data),
      save: vi.fn(async () => undefined),
    },
    network: {
      fetch: vi.fn(async () => opts?.response ?? responseFromJson(catalog())),
    },
  } as unknown as CoPluginApp;
}

describe('catalog loader', () => {
  it('returns default catalog URL when no override exists', async () => {
    await expect(getCatalogUrl(makeApp())).resolves.toBe(DEFAULT_CATALOG_URL);
  });

  it('returns user override when set', async () => {
    const url = 'https://github.com/philip1974/catalog.json';
    await expect(
      getCatalogUrl(makeApp({ data: { [CATALOG_URL_CONFIG_KEY]: url } })),
    ).resolves.toBe(url);
  });

  it('rejects placeholder catalog URLs', async () => {
    const app = makeApp({
      data: {
        [CATALOG_URL_CONFIG_KEY]:
          'https://raw.githubusercontent.com/{TBD-org}/catalog.json',
      },
    });
    await expect(loadCatalog(app)).rejects.toThrow(CatalogUrlPlaceholderError);
  });

  it('rejects http catalog URLs', async () => {
    const app = makeApp({
      data: { [CATALOG_URL_CONFIG_KEY]: 'http://github.com/philip1974/catalog.json' },
    });
    await expect(loadCatalog(app)).rejects.toThrow(UrlNotAllowedError);
  });

  it('rejects non-allowlisted catalog hosts', async () => {
    const app = makeApp({
      data: { [CATALOG_URL_CONFIG_KEY]: 'https://evil.com/catalog.json' },
    });
    await expect(loadCatalog(app)).rejects.toThrow(UrlNotAllowedError);
  });

  it('fetches and parses a valid catalog', async () => {
    const index = await loadCatalog(makeApp({ response: responseFromJson(catalog()) }));
    expect(index.schemaVersion).toBe(1);
    expect(index.entries[0]?.id).toBe('skill');
  });

  it('rejects catalog bodies over 1MB', async () => {
    const app = makeApp({
      response: responseFromBytes(new Uint8Array(CATALOG_MAX_SIZE_BYTES + 1)),
    });
    await expect(loadCatalog(app)).rejects.toThrow(CatalogTooLargeError);
  });

  it('rejects unsupported schema versions', async () => {
    const app = makeApp({ response: responseFromJson(catalog(2)) });
    await expect(loadCatalog(app)).rejects.toThrow(CatalogSchemaUnsupportedError);
  });

  it('uses cache while it is within TTL', async () => {
    const cachedIndex = catalog();
    const app = makeApp({
      data: {
        [CACHE_KEY_PREFIX + DEFAULT_CATALOG_URL]: {
          fetchedAt: Date.now(),
          expiresAt: Date.now() + CACHE_TTL_MS,
          index: cachedIndex,
        },
      },
    });
    await expect(loadCatalog(app)).resolves.toBe(cachedIndex);
    expect(app.network.fetch).not.toHaveBeenCalled();
  });

  it('forceRefresh skips a fresh cache entry', async () => {
    const app = makeApp({
      data: {
        [CACHE_KEY_PREFIX + DEFAULT_CATALOG_URL]: {
          fetchedAt: Date.now(),
          expiresAt: Date.now() + CACHE_TTL_MS,
          index: catalog(),
        },
      },
      response: responseFromJson(catalog()),
    });
    await loadCatalog(app, { forceRefresh: true });
    expect(app.network.fetch).toHaveBeenCalledWith(DEFAULT_CATALOG_URL);
  });

  it('stores fetchedAt and expiresAt in cache', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-30T03:05:00Z'));
    try {
      const data: Record<string, unknown> = {};
      const app = makeApp({ data, response: responseFromJson(catalog()) });
      await loadCatalog(app);
      const saved = vi.mocked(app.dataStore.save).mock.calls[0]?.[0];
      const entry = saved?.[
        CACHE_KEY_PREFIX + DEFAULT_CATALOG_URL
      ] as { fetchedAt: number; expiresAt: number } | undefined;
      expect(entry?.fetchedAt).toBe(Date.now());
      expect(entry?.expiresAt).toBe(Date.now() + CACHE_TTL_MS);
    } finally {
      vi.useRealTimers();
    }
  });

  it('sets and clears user catalog URL override', async () => {
    const data: Record<string, unknown> = { keep: true };
    const app = makeApp({ data });
    await setUserCatalogUrlOverride(app, 'https://github.com/philip1974/catalog.json');
    expect(app.dataStore.save).toHaveBeenLastCalledWith({
      keep: true,
      [CATALOG_URL_CONFIG_KEY]: 'https://github.com/philip1974/catalog.json',
    });
    await setUserCatalogUrlOverride(app, null);
    expect(app.dataStore.save).toHaveBeenLastCalledWith({ keep: true });
  });
});
