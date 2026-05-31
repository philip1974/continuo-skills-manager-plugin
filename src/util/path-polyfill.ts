// POSIX-only path utils (topic-05 - replaces node:path; renderer CSP rejects node:* imports).
// Behavior matches node:path.posix.

export const sep = '/' as const;

export function basename(p: string): string {
  if (p === '') return '';
  // Strip trailing slashes but keep root
  let end = p.length;
  while (end > 1 && p.charCodeAt(end - 1) === 47) end--;
  let start = end;
  while (start > 0 && p.charCodeAt(start - 1) !== 47) start--;
  return p.slice(start, end);
}

export function dirname(p: string): string {
  if (p === '') return '.';
  // matches node:path.posix.dirname
  // Strip trailing slashes
  let end = p.length;
  while (end > 1 && p.charCodeAt(end - 1) === 47) end--;
  // Find last slash
  let lastSlash = -1;
  for (let i = end - 1; i >= 0; i--) {
    if (p.charCodeAt(i) === 47) {
      lastSlash = i;
      break;
    }
  }
  if (lastSlash === -1) return '.';
  if (lastSlash === 0) return '/';
  return p.slice(0, lastSlash);
}

export function normalize(p: string): string {
  if (p === '') return '.';
  const isAbsolute = p.charCodeAt(0) === 47;
  const trailingSlash = p.length > 1 && p.charCodeAt(p.length - 1) === 47;
  const parts = p.split('/');
  const result: string[] = [];
  for (const part of parts) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      if (result.length > 0 && result[result.length - 1] !== '..') {
        result.pop();
      } else if (!isAbsolute) {
        result.push('..');
      }
    } else {
      result.push(part);
    }
  }
  let out = result.join('/');
  if (isAbsolute) out = '/' + out;
  if (trailingSlash && !out.endsWith('/')) out += '/';
  if (out === '') return isAbsolute ? '/' : '.';
  return out;
}

export function join(...parts: string[]): string {
  if (parts.length === 0) return '.';
  const filtered = parts.filter(p => p !== '');
  if (filtered.length === 0) return '.';
  const joined = filtered.join('/');
  return normalize(joined);
}
