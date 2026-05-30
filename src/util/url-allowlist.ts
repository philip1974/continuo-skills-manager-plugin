// Three-layer URL check: protocol, host, and optional exact URL allowlist.

export class UrlNotAllowedError extends Error {
  readonly code = 'URL_NOT_ALLOWED';

  constructor(
    message: string,
    public readonly url: string,
    public readonly reason: 'protocol' | 'host' | 'allowlist',
  ) {
    super(message);
    this.name = 'UrlNotAllowedError';
  }
}

export function assertUrlInAllowlist(
  url: string,
  options: {
    protocolAllowlist: readonly string[];
    hostAllowlist: readonly string[];
    exactUrlAllowlist?: readonly string[];
  },
): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new UrlNotAllowedError(`invalid URL: ${url}`, url, 'protocol');
  }

  if (!options.protocolAllowlist.includes(parsed.protocol)) {
    throw new UrlNotAllowedError(
      `protocol ${parsed.protocol} not allowed`,
      url,
      'protocol',
    );
  }
  if (!options.hostAllowlist.includes(parsed.hostname)) {
    throw new UrlNotAllowedError(
      `host ${parsed.hostname} not allowed`,
      url,
      'host',
    );
  }
  if (options.exactUrlAllowlist && !options.exactUrlAllowlist.includes(url)) {
    throw new UrlNotAllowedError('URL not in exactUrlAllowlist', url, 'allowlist');
  }
  return parsed;
}
