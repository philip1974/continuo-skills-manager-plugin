// src/types/sdk-shim.ts
var co = new Proxy({}, {
  get(_target, prop) {
    const real = globalThis.co;
    if (!real) {
      throw new Error(
        `sdk-shim: globalThis.co not initialized when accessing co.${String(prop)}`
      );
    }
    return real[prop];
  }
});

// src/config/catalog-allowlist.ts
var DEFAULT_CATALOG_URL = "https://raw.githubusercontent.com/philip1974/continuo-skills-catalog/main/catalog.json";
var CATALOG_HOST_ALLOWLIST = Object.freeze([
  "raw.githubusercontent.com",
  "github.com"
]);
var CATALOG_PROTOCOL_ALLOWLIST = Object.freeze([
  "https:"
]);
var CATALOG_MAX_SIZE_BYTES = 1 * 1024 * 1024;
function isPlaceholderCatalogUrl(url) {
  return url.includes("{TBD-org}") || url.includes("{TBD-USER}");
}

// src/util/url-allowlist.ts
var UrlNotAllowedError = class extends Error {
  constructor(message, url, reason) {
    super(message);
    this.url = url;
    this.reason = reason;
    this.name = "UrlNotAllowedError";
  }
  code = "URL_NOT_ALLOWED";
};
function assertUrlInAllowlist(url, options) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new UrlNotAllowedError(`invalid URL: ${url}`, url, "protocol");
  }
  if (!options.protocolAllowlist.includes(parsed.protocol)) {
    throw new UrlNotAllowedError(
      `protocol ${parsed.protocol} not allowed`,
      url,
      "protocol"
    );
  }
  if (!options.hostAllowlist.includes(parsed.hostname)) {
    throw new UrlNotAllowedError(
      `host ${parsed.hostname} not allowed`,
      url,
      "host"
    );
  }
  if (options.exactUrlAllowlist && !options.exactUrlAllowlist.includes(url)) {
    throw new UrlNotAllowedError("URL not in exactUrlAllowlist", url, "allowlist");
  }
  return parsed;
}

// src/catalog/loader.ts
var { z } = co;
var CACHE_KEY_PREFIX = "catalog:";
var CACHE_TTL_MS = 24 * 60 * 60 * 1e3;
var CATALOG_URL_CONFIG_KEY = "config:catalog-url";
var catalogEntrySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  version: z.string().optional(),
  gitUrl: z.string(),
  sha: z.string(),
  hash: z.string(),
  subpath: z.string().optional()
});
var catalogIndexSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.string(),
  seedPhase: z.boolean().optional(),
  entries: z.array(catalogEntrySchema)
});
var CatalogTooLargeError = class extends Error {
  constructor(sizeBytes) {
    super(
      `catalog size ${sizeBytes} bytes exceeds cap ${CATALOG_MAX_SIZE_BYTES} bytes`
    );
    this.sizeBytes = sizeBytes;
    this.name = "CatalogTooLargeError";
  }
  code = "CATALOG_TOO_LARGE";
};
var CatalogSchemaUnsupportedError = class extends Error {
  constructor(schemaVersion) {
    super(
      `catalog schemaVersion ${String(schemaVersion)} unsupported (v0.1 expects 1)`
    );
    this.schemaVersion = schemaVersion;
    this.name = "CatalogSchemaUnsupportedError";
  }
  code = "CATALOG_SCHEMA_UNSUPPORTED";
};
var CatalogUrlPlaceholderError = class extends Error {
  constructor(url) {
    super("catalog URL is placeholder; configure in Settings tab");
    this.url = url;
    this.name = "CatalogUrlPlaceholderError";
  }
  code = "CATALOG_URL_PLACEHOLDER";
};
async function getCatalogUrl(app) {
  const stored = await app.dataStore.load();
  const userOverride = stored[CATALOG_URL_CONFIG_KEY];
  if (typeof userOverride === "string" && userOverride.length > 0) {
    return userOverride;
  }
  return DEFAULT_CATALOG_URL;
}
async function loadCatalog(app, options) {
  const url = await getCatalogUrl(app);
  if (isPlaceholderCatalogUrl(url)) {
    throw new CatalogUrlPlaceholderError(url);
  }
  assertUrlInAllowlist(url, {
    protocolAllowlist: CATALOG_PROTOCOL_ALLOWLIST,
    hostAllowlist: CATALOG_HOST_ALLOWLIST
  });
  const cacheKey = CACHE_KEY_PREFIX + url;
  if (!options?.forceRefresh) {
    const stored = await app.dataStore.load();
    const cached = stored[cacheKey];
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
  const text = new TextDecoder("utf-8", { fatal: true }).decode(
    new Uint8Array(buffer)
  );
  const raw = JSON.parse(text);
  if (raw.schemaVersion !== 1) {
    throw new CatalogSchemaUnsupportedError(raw.schemaVersion);
  }
  const parsed = catalogIndexSchema.parse(raw);
  const data = await app.dataStore.load();
  const now = Date.now();
  const cacheEntry = {
    fetchedAt: now,
    expiresAt: now + CACHE_TTL_MS,
    index: parsed
  };
  data[cacheKey] = cacheEntry;
  await app.dataStore.save(data);
  return parsed;
}
async function setUserCatalogUrlOverride(app, url) {
  const data = await app.dataStore.load();
  if (url === null) {
    delete data[CATALOG_URL_CONFIG_KEY];
  } else {
    data[CATALOG_URL_CONFIG_KEY] = url;
  }
  await app.dataStore.save(data);
}

// src/util/web-crypto-helpers.ts
async function digestSha256Hex(bytes) {
  const digestBuf = await crypto.subtle.digest(
    "SHA-256",
    bytes
  );
  const arr = new Uint8Array(digestBuf);
  let hex = "";
  for (let i = 0; i < arr.length; i++) {
    hex += arr[i].toString(16).padStart(2, "0");
  }
  return hex;
}
function concatBytes(parts) {
  let total = 0;
  for (const p of parts) total += p.byteLength;
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.byteLength;
  }
  return out;
}
function decodeUtf8(bytes) {
  return new TextDecoder("utf-8").decode(bytes);
}

// src/util/exec-stream-helper.ts
async function execStreamCollect(app, cmd, args, opts) {
  const { chunks, done } = app.shell.execStream(cmd, args, opts);
  const stdoutParts = [];
  const stderrParts = [];
  for await (const chunk of chunks) {
    if (chunk.stream === "stdout") stdoutParts.push(chunk.chunk);
    else stderrParts.push(chunk.chunk);
  }
  const exit = await done;
  return {
    stdout: concatBytes(stdoutParts),
    stderr: concatBytes(stderrParts),
    exitCode: exit.exitCode,
    signal: exit.signal
  };
}

// src/util/path-polyfill.ts
var sep = "/";
function basename(p) {
  if (p === "") return "";
  let end = p.length;
  while (end > 1 && p.charCodeAt(end - 1) === 47) end--;
  let start = end;
  while (start > 0 && p.charCodeAt(start - 1) !== 47) start--;
  return p.slice(start, end);
}
function dirname(p) {
  if (p === "") return ".";
  let end = p.length;
  while (end > 1 && p.charCodeAt(end - 1) === 47) end--;
  let lastSlash = -1;
  for (let i = end - 1; i >= 0; i--) {
    if (p.charCodeAt(i) === 47) {
      lastSlash = i;
      break;
    }
  }
  if (lastSlash === -1) return ".";
  if (lastSlash === 0) return "/";
  return p.slice(0, lastSlash);
}
function normalize(p) {
  if (p === "") return ".";
  const isAbsolute = p.charCodeAt(0) === 47;
  const trailingSlash = p.length > 1 && p.charCodeAt(p.length - 1) === 47;
  const parts = p.split("/");
  const result = [];
  for (const part of parts) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (result.length > 0 && result[result.length - 1] !== "..") {
        result.pop();
      } else if (!isAbsolute) {
        result.push("..");
      }
    } else {
      result.push(part);
    }
  }
  let out = result.join("/");
  if (isAbsolute) out = "/" + out;
  if (trailingSlash && !out.endsWith("/")) out += "/";
  if (out === "") return isAbsolute ? "/" : ".";
  return out;
}
function join(...parts) {
  if (parts.length === 0) return ".";
  const filtered = parts.filter((p) => p !== "");
  if (filtered.length === 0) return ".";
  const joined = filtered.join("/");
  return normalize(joined);
}

// src/util/utf8-validate.ts
var BinaryBlobRejectedError = class extends Error {
  constructor(message, cause) {
    super(message);
    this.cause = cause;
    this.name = "BinaryBlobRejectedError";
  }
  code = "BINARY_BLOB_REJECTED";
};
var BOM_UTF8 = [239, 187, 191];
function decodeUtf8Strict(bytes, opts) {
  const stripBom = opts?.stripBom ?? true;
  const normalize2 = opts?.normalize ?? "NFC";
  let view = bytes;
  if (stripBom && view.length >= 3 && view[0] === BOM_UTF8[0] && view[1] === BOM_UTF8[1] && view[2] === BOM_UTF8[2]) {
    view = bytes.subarray(3);
  }
  let value;
  try {
    value = new TextDecoder("utf-8", {
      fatal: true,
      ignoreBOM: !stripBom
    }).decode(view);
  } catch (err) {
    throw new BinaryBlobRejectedError(
      `non-UTF-8 byte sequence: ${err.message}`,
      err
    );
  }
  if (normalize2 !== "none") value = value.normalize(normalize2);
  return value;
}

// src/trust/safe-fs.ts
var encoder = new TextEncoder();
var nul = new Uint8Array([0]);
var ScopeError = class extends Error {
  constructor(message, details) {
    super(message);
    this.details = details;
    this.name = "ScopeError";
  }
  code = "SCOPE_ERROR";
};
var SymlinkRootRejectedError = class extends ScopeError {
  constructor(root) {
    super(`skills root is a symlink (literal path policy): ${root}`, {
      target: root,
      reason: "symlink-root"
    });
    this.name = "SymlinkRootRejectedError";
  }
};
var DirectoryAssetsNotSupportedError = class extends ScopeError {
  constructor(entryId, extraFiles) {
    super(
      `directory assets not supported in v0.1 for ${entryId} (found: ${extraFiles.slice(0, 3).join(", ")}${extraFiles.length > 3 ? ", ..." : ""})`,
      { reason: "directory-assets" }
    );
    this.entryId = entryId;
    this.extraFiles = extraFiles;
    this.name = "DirectoryAssetsNotSupportedError";
  }
};
async function assertInsideSkillsRoot(app, target, root) {
  const rootStat = await app.fs.lstat(root);
  if (rootStat.isSymlink) throw new SymlinkRootRejectedError(root);
  const canonicalTarget = await app.fs.realpath(target);
  const boundaryRoot = normalize(root);
  if (canonicalTarget === boundaryRoot || canonicalTarget.startsWith(boundaryRoot + sep)) {
    return { canonicalTarget };
  }
  throw new ScopeError("target outside skills root", {
    target: canonicalTarget,
    reason: "outside-root"
  });
}
async function safeRemoveSkill(app, target, root) {
  await assertInsideSkillsRoot(app, target, root);
  await app.fs.rm(target, { recursive: true, force: false });
}
async function safeCopyTreeFromBlobs(app, blobs, dst, repoDir, opts) {
  const allowed = blobs.filter((blob) => basename(blob.path) === "SKILL.md");
  const extra = blobs.filter((blob) => basename(blob.path) !== "SKILL.md");
  if (extra.length > 0) {
    throw new DirectoryAssetsNotSupportedError(
      opts.entryId,
      extra.map((blob) => blob.path)
    );
  }
  if (allowed.length === 0) {
    throw new ScopeError(`no SKILL.md in blobs for ${opts.entryId}`);
  }
  for (const blob of allowed) {
    const bytes = await app.fs.readGitBlob(repoDir, blob.sha);
    const text = decodeUtf8Strict(bytes);
    const fullPath = normalize(dst + sep + blob.path);
    const parentDir = dirname(fullPath);
    await app.fs.mkdir(parentDir, { recursive: true });
    await app.fs.writeFile(fullPath, text);
  }
}
async function safeAtomicReplace(app, staging, final, opts) {
  await app.fs.atomicReplaceWithinScope(staging, final, opts);
}
async function treeHashFromGit(app, repoDir, ref, subpath) {
  const ls = await execStreamCollect(
    app,
    "git",
    ["ls-tree", "-r", ref, subpath || "."],
    { cwd: repoDir }
  );
  if (ls.exitCode !== 0) {
    throw new Error(`git ls-tree failed: ${decodeUtf8(ls.stderr)}`);
  }
  const blobs = [];
  const lines = decodeUtf8(ls.stdout).trim().split("\n").filter((line) => line);
  for (const line of lines) {
    const match = line.match(/^(\d+)\s+(blob|tree)\s+([0-9a-f]+)\s+(.+)$/);
    const kind = match?.[2];
    const sha = match?.[3];
    const path = match?.[4];
    if (kind === "blob" && sha && path && basename(path) === "SKILL.md") {
      blobs.push({ sha, path });
    }
  }
  blobs.sort((a, b) => a.path.localeCompare(b.path));
  const parts = [];
  for (const blob of blobs) {
    const bytes = await app.fs.readGitBlob(repoDir, blob.sha);
    decodeUtf8Strict(bytes);
    parts.push(encoder.encode(blob.path));
    parts.push(nul);
    parts.push(bytes);
    parts.push(nul);
  }
  return await digestSha256Hex(concatBytes(parts));
}

// src/installer/validate.ts
var HashMismatchError = class extends Error {
  constructor(expected, actual) {
    super(
      `hash mismatch: expected ${expected.slice(0, 16)}... got ${actual.slice(0, 16)}...`
    );
    this.expected = expected;
    this.actual = actual;
    this.name = "HashMismatchError";
  }
  code = "HASH_MISMATCH";
};
var ExpiredReceiptError = class extends Error {
  constructor(receipt) {
    super(
      `ValidationReceipt expired (issued at ${new Date(
        receipt.expiresAt - 5 * 60 * 1e3
      ).toISOString()}); re-validate via PreviewDrawer`
    );
    this.receipt = receipt;
    this.name = "ExpiredReceiptError";
  }
  code = "EXPIRED_RECEIPT";
};
var RECEIPT_TTL_MS = 5 * 60 * 1e3;
var encoder2 = new TextEncoder();
function randomHex(byteLength) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, "0");
  }
  return out;
}
async function validateAndIssueReceipt(app, args) {
  const computed = await treeHashFromGit(
    app,
    args.repoDir,
    args.entry.sha,
    args.entry.subpath ?? ""
  );
  if (computed !== args.entry.hash) {
    throw new HashMismatchError(args.entry.hash, computed);
  }
  const fileListHash = await digestSha256Hex(
    encoder2.encode(`${args.entry.subpath ?? ""}/SKILL.md`)
  );
  return {
    ref: args.entry.sha,
    sha256: args.entry.hash,
    approvedHash: computed,
    fileListHash,
    scope: args.scope,
    finalTarget: args.finalTarget,
    nonce: randomHex(16),
    expiresAt: Date.now() + RECEIPT_TTL_MS
  };
}
function assertReceiptFresh(receipt) {
  if (Date.now() >= receipt.expiresAt) throw new ExpiredReceiptError(receipt);
}

// src/installer/commit.ts
var CommitError = class extends Error {
  constructor(stage, message) {
    super(`commit ${stage} failed: ${message}`);
    this.stage = stage;
    this.name = "CommitError";
  }
  code = "COMMIT_ERROR";
};
async function commit(app, args) {
  assertReceiptFresh(args.receipt);
  let rehash;
  try {
    rehash = await treeHashFromGit(
      app,
      args.repoDir,
      args.entry.sha,
      args.entry.subpath ?? ""
    );
  } catch (err) {
    throw new CommitError("rehash", String(err));
  }
  if (rehash !== args.receipt.approvedHash) {
    throw new HashMismatchError(args.receipt.approvedHash, rehash);
  }
  const ls = await execStreamCollect(
    app,
    "git",
    ["ls-tree", "-r", args.entry.sha, args.entry.subpath ?? "."],
    { cwd: args.repoDir }
  );
  if (ls.exitCode !== 0) {
    throw new CommitError(
      "staging",
      `git ls-tree failed: ${decodeUtf8(ls.stderr)}`
    );
  }
  const subpath = args.entry.subpath ?? "";
  const stripPrefix = subpath ? subpath.replace(/\/$/, "") + "/" : "";
  const blobs = [];
  for (const line of decodeUtf8(ls.stdout).trim().split("\n").filter((item) => item)) {
    const match = line.match(/^(\d+)\s+(blob|tree)\s+([0-9a-f]+)\s+(.+)$/);
    const kind = match?.[2];
    const sha = match?.[3];
    const path = match?.[4];
    if (kind === "blob" && sha && path) {
      const relPath = stripPrefix && path.startsWith(stripPrefix) ? path.slice(stripPrefix.length) : path;
      blobs.push({ path: relPath, sha });
    }
  }
  const parent = dirname(args.receipt.finalTarget);
  const idHash = args.entry.id.replace(/[^a-z0-9-]/gi, "");
  const staging = `${parent}${sep}.staging-${idHash}-${Date.now()}`;
  let stagingMade = false;
  try {
    await safeCopyTreeFromBlobs(app, blobs, staging, args.repoDir, {
      entryId: args.entry.id
    });
    stagingMade = true;
  } catch (err) {
    if (stagingMade) {
      try {
        await app.fs.rm(staging, { recursive: true, force: true });
      } catch {
      }
    }
    throw new CommitError("staging", String(err));
  }
  try {
    await safeAtomicReplace(app, staging, args.receipt.finalTarget, {
      overwrite: args.overwrite
    });
  } catch (err) {
    try {
      await app.fs.rm(staging, { recursive: true, force: true });
    } catch {
    }
    throw new CommitError("replace", String(err));
  }
}

// src/installer/clone.ts
var UnsupportedHostError = class extends Error {
  constructor(host) {
    super(
      `Only GitHub immutable SHA catalogs are supported in v0.1; declared host: ${host}`
    );
    this.host = host;
    this.name = "UnsupportedHostError";
  }
  code = "UNSUPPORTED_HOST";
};
var CloneError = class extends Error {
  constructor(stage, stderr) {
    super(`git ${stage} failed: ${stderr.trim().split("\n")[0]}`);
    this.stage = stage;
    this.stderr = stderr;
    this.name = "CloneError";
  }
  code = "CLONE_ERROR";
};
var ALLOWED_GIT_HOSTS = ["github.com"];
async function cloneAtSha(app, args) {
  const url = new URL(args.gitUrl);
  if (!ALLOWED_GIT_HOSTS.includes(url.hostname)) {
    throw new UnsupportedHostError(url.hostname);
  }
  await app.fs.mkdir(args.tmpDir, { recursive: true });
  const init = await execStreamCollect(app, "git", ["init", "--quiet"], {
    cwd: args.tmpDir
  });
  if (init.exitCode !== 0) {
    throw new CloneError("init", decodeUtf8(init.stderr));
  }
  const fetch = await execStreamCollect(
    app,
    "git",
    ["fetch", "--depth", "1", args.gitUrl, args.sha],
    { cwd: args.tmpDir }
  );
  if (fetch.exitCode !== 0) {
    throw new CloneError("fetch", decodeUtf8(fetch.stderr));
  }
  const checkout = await execStreamCollect(
    app,
    "git",
    ["checkout", "--detach", args.sha],
    { cwd: args.tmpDir }
  );
  if (checkout.exitCode !== 0) {
    throw new CloneError("checkout", decodeUtf8(checkout.stderr));
  }
  const canonicalDir = await app.fs.realpath(args.tmpDir);
  return { canonicalDir };
}

// src/scanner/index.ts
var SKILL_MD = "SKILL.md";
function parseFrontmatter(content) {
  if (!content.startsWith("---\n")) return {};
  const end = content.indexOf("\n---\n", 4);
  if (end < 0) return {};
  const yaml = content.slice(4, end);
  const result = {};
  for (const line of yaml.split("\n")) {
    const match = line.match(/^(name|description)\s*:\s*(.+)$/);
    if (match?.[1] && match[2]) {
      const key = match[1];
      let value = match[2].trim();
      if (value.startsWith('"') && value.endsWith('"') || value.startsWith("'") && value.endsWith("'")) {
        value = value.slice(1, -1);
      }
      result[key] = value;
    }
  }
  return result;
}
async function scanScope(app, root, scope) {
  const records = [];
  let entries;
  try {
    entries = await app.fs.listDir(root);
  } catch {
    return [];
  }
  for (const entry of entries) {
    if (entry.isFile && entry.name.endsWith(".md") && entry.name !== SKILL_MD) {
      const fullPath = `${root}${sep}${entry.name}`;
      try {
        const content = await app.fs.readFile(fullPath);
        const fm = parseFrontmatter(content);
        const id = entry.name.replace(/\.md$/, "");
        records.push({
          id,
          displayName: fm.name ?? id,
          ...fm.description !== void 0 && { description: fm.description },
          scope,
          source: "single-file",
          path: fullPath
        });
      } catch {
      }
    } else if (entry.isDirectory) {
      const skillMdPath = `${root}${sep}${entry.name}${sep}${SKILL_MD}`;
      try {
        const content = await app.fs.readFile(skillMdPath);
        const fm = parseFrontmatter(content);
        records.push({
          id: entry.name,
          displayName: fm.name ?? entry.name,
          ...fm.description !== void 0 && { description: fm.description },
          scope,
          source: "directory",
          path: skillMdPath
        });
      } catch {
      }
    }
  }
  return records;
}

// src/scope/path-resolver.ts
async function resolveUserScope(app) {
  const home = await app.fs.userHome();
  return join(home, ".claude", "skills");
}
async function resolveProjectScope(app) {
  const root = await app.workspace.getRoot();
  if (!root) return null;
  try {
    const result = await execStreamCollect(app, "git", ["rev-parse", "--git-dir"], {
      cwd: root
    });
    if (result.exitCode !== 0) return null;
  } catch {
    return null;
  }
  return join(root, ".claude", "skills");
}

// src/uninstaller/index.ts
var UninstallScopeError = class extends Error {
  code = "UNINSTALL_SCOPE_ERROR";
  constructor(message) {
    super(message);
    this.name = "UninstallScopeError";
  }
};
async function uninstall(app, record) {
  let root;
  if (record.scope === "user") {
    root = await resolveUserScope(app);
  } else {
    root = await resolveProjectScope(app);
  }
  if (root === null) {
    throw new UninstallScopeError(`scope ${record.scope} root not available`);
  }
  const target = record.source === "single-file" ? record.path : record.path.replace(/[\\/]SKILL\.md$/, "");
  await safeRemoveSkill(app, target, root);
}

// src/ui/PanelMain.ts
var { React } = co;
var h = React.createElement;
var styles = {
  region: {
    height: "100%",
    overflowY: "auto",
    boxSizing: "border-box",
    padding: 16,
    color: "var(--md-fg, #e6e6e6)",
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontSize: 12
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    color: "var(--md-fg-dim, #6a6a6a)",
    margin: "20px 0 10px"
  },
  sectionTitleFirst: {
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    color: "var(--md-fg-dim, #6a6a6a)",
    margin: "0 0 10px"
  },
  card: {
    border: "1px solid var(--md-line, #2a2a2a)",
    background: "var(--md-panel, #1a1a1a)",
    borderRadius: 6,
    padding: "12px 14px",
    marginBottom: 8,
    display: "flex",
    alignItems: "flex-start",
    gap: 12
  },
  cardDisabled: {
    border: "1px dashed var(--md-line, #2a2a2a)",
    background: "transparent",
    borderRadius: 6,
    padding: "12px 14px",
    marginBottom: 8,
    color: "var(--md-fg-dim, #6a6a6a)"
  },
  cardBody: {
    flex: 1,
    minWidth: 0
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--md-fg, #e6e6e6)",
    marginBottom: 4,
    overflow: "hidden",
    textOverflow: "ellipsis"
  },
  cardDesc: {
    fontSize: 11,
    color: "var(--md-fg-muted, #9a9a9a)",
    lineHeight: 1.5,
    wordBreak: "break-word"
  },
  cardMeta: {
    fontSize: 10,
    color: "var(--md-fg-dim, #6a6a6a)",
    marginTop: 6,
    fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace"
  },
  btnPrimary: {
    border: "none",
    borderRadius: 4,
    padding: "6px 14px",
    fontSize: 11,
    fontWeight: 500,
    cursor: "pointer",
    whiteSpace: "nowrap",
    background: "var(--md-accent, #4a7afd)",
    color: "#fff"
  },
  btnGhost: {
    border: "1px solid var(--md-line, #3a3a3a)",
    borderRadius: 4,
    padding: "6px 14px",
    fontSize: 11,
    fontWeight: 500,
    cursor: "pointer",
    whiteSpace: "nowrap",
    background: "transparent",
    color: "var(--md-fg-muted, #aaa)"
  },
  btnDisabled: {
    border: "1px solid var(--md-line, #2a2a2a)",
    borderRadius: 4,
    padding: "6px 14px",
    fontSize: 11,
    fontWeight: 500,
    cursor: "not-allowed",
    whiteSpace: "nowrap",
    background: "transparent",
    color: "var(--md-fg-dim, #555)",
    opacity: 0.6
  },
  installedBadge: {
    fontSize: 10,
    padding: "4px 8px",
    borderRadius: 3,
    background: "var(--md-panel-soft, #222)",
    color: "var(--md-fg-muted, #8a8a8a)",
    whiteSpace: "nowrap"
  },
  errorBox: {
    border: "1px solid #6b3030",
    background: "#3a1818",
    color: "#f0b0b0",
    borderRadius: 4,
    padding: "8px 10px",
    fontSize: 11,
    marginBottom: 8
  },
  emptyMsg: {
    fontSize: 11,
    color: "var(--md-fg-dim, #6a6a6a)",
    fontStyle: "italic",
    padding: "8px 14px"
  }
};
function skillCard(record, scopeLabel, busy, busyId, onUninstall) {
  const isBusy = busy && busyId === record.id;
  return h(
    "div",
    {
      key: `${scopeLabel}:${record.id}`,
      "data-testid": `skill-row-${scopeLabel}-${record.id}`,
      style: styles.card
    },
    h(
      "div",
      { style: styles.cardBody },
      h("div", { style: styles.cardTitle }, record.displayName),
      record.description && h("div", { style: styles.cardDesc }, record.description),
      h("div", { style: styles.cardMeta }, record.id)
    ),
    h(
      "button",
      {
        onClick: () => onUninstall(record),
        disabled: busy,
        style: busy ? styles.btnDisabled : styles.btnGhost
      },
      isBusy ? "Removing\u2026" : "Uninstall"
    )
  );
}
var PLACEHOLDER_SHA = "0".repeat(40);
function isPlaceholderSha(sha) {
  return sha === PLACEHOLDER_SHA || /^0+$/.test(sha);
}
function scopeButton(scope, scopeAvailable, installedHere, entry, busy, isBusy, placeholder, onInstall, onUninstall) {
  const scopeLabel = scope === "user" ? "User" : "Project";
  const testId = `catalog-${scope}-btn-${entry.id}`;
  if (scope === "project" && !scopeAvailable) {
    return h(
      "button",
      {
        key: scope,
        "data-testid": testId,
        disabled: true,
        style: styles.btnDisabled,
        title: "Configure Project skills root in Settings or open a git-backed workspace."
      },
      `${scopeLabel}: N/A`
    );
  }
  if (installedHere) {
    return h(
      "button",
      {
        key: scope,
        "data-testid": testId,
        onClick: () => onUninstall(installedHere),
        disabled: busy,
        style: busy ? styles.btnDisabled : styles.btnGhost
      },
      isBusy ? `${scopeLabel}: Removing\u2026` : `Uninstall ${scopeLabel}`
    );
  }
  if (placeholder) {
    return h(
      "button",
      {
        key: scope,
        "data-testid": testId,
        disabled: true,
        style: styles.btnDisabled,
        title: "Catalog entry has placeholder SHA \u2014 not installable yet."
      },
      `Install ${scopeLabel}`
    );
  }
  return h(
    "button",
    {
      key: scope,
      "data-testid": testId,
      onClick: () => onInstall(entry, scope),
      disabled: busy,
      style: busy ? styles.btnDisabled : styles.btnPrimary
    },
    isBusy ? `Installing ${scopeLabel}\u2026` : `Install ${scopeLabel}`
  );
}
function catalogCard(entry, userInstalled, projectInstalled, projectSupported, busy, busyId, onInstall, onUninstall) {
  const isBusy = busy && busyId === entry.id;
  const placeholder = isPlaceholderSha(entry.sha);
  return h(
    "div",
    {
      key: `catalog:${entry.id}`,
      "data-testid": `catalog-row-${entry.id}`,
      style: styles.card
    },
    h(
      "div",
      { style: styles.cardBody },
      h(
        "div",
        { style: styles.cardTitle },
        entry.name,
        entry.version && h(
          "span",
          {
            style: {
              marginLeft: 8,
              fontSize: 10,
              color: "var(--md-fg-dim, #6a6a6a)",
              fontWeight: 400
            }
          },
          `v${entry.version}`
        ),
        placeholder && h(
          "span",
          {
            style: {
              marginLeft: 8,
              fontSize: 10,
              color: "#d4a04a",
              fontWeight: 500,
              padding: "2px 6px",
              borderRadius: 3,
              border: "1px solid #6b5020",
              background: "#3a2a10"
            },
            title: "Catalog entry is a seed placeholder \u2014 SHA not yet populated; not installable."
          },
          "seed"
        )
      ),
      entry.description && h("div", { style: styles.cardDesc }, entry.description),
      h("div", { style: styles.cardMeta }, `${entry.id} \xB7 ${entry.sha.slice(0, 7)}`)
    ),
    h(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "column",
          gap: 6,
          alignItems: "stretch",
          minWidth: 130
        }
      },
      scopeButton(
        "user",
        true,
        userInstalled,
        entry,
        busy,
        isBusy,
        placeholder,
        onInstall,
        onUninstall
      ),
      scopeButton(
        "project",
        projectSupported,
        projectInstalled,
        entry,
        busy,
        isBusy,
        placeholder,
        onInstall,
        onUninstall
      )
    )
  );
}
function PanelMain({ app }) {
  const [userSkills, setUserSkills] = React.useState(null);
  const [projectSkills, setProjectSkills] = React.useState(
    null
  );
  const [projectRoot, setProjectRoot] = React.useState(null);
  const [userRoot, setUserRoot] = React.useState(null);
  const [refreshTick, setRefreshTick] = React.useState(0);
  const [busy, setBusy] = React.useState(false);
  const [busyId, setBusyId] = React.useState(null);
  const [catalog, setCatalog] = React.useState(null);
  const [catalogError, setCatalogError] = React.useState(null);
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const uRoot = await resolveUserScope(app);
      const pRoot = await resolveProjectScope(app);
      const ws = await app.workspace.getRoot();
      const projectClaude = ws ? `${ws}${sep}.claude` : null;
      const scopes = [
        { path: uRoot, mode: "rw" }
      ];
      if (projectClaude) scopes.push({ path: projectClaude, mode: "rw" });
      let granted = false;
      try {
        granted = await app.fs.requestScope(scopes) === "grant";
      } catch {
        granted = false;
      }
      if (granted && projectClaude && pRoot) {
        try {
          await app.fs.mkdir(projectClaude, { recursive: true });
        } catch {
        }
        try {
          await app.fs.mkdir(pRoot, { recursive: true });
        } catch {
        }
      }
      const nextUser = granted ? await scanScope(app, uRoot, "user") : [];
      const nextProject = granted && pRoot ? await scanScope(app, pRoot, "project") : [];
      let nextCatalog = null;
      let nextCatErr = null;
      try {
        nextCatalog = await loadCatalog(app);
      } catch (e) {
        nextCatErr = e instanceof Error ? e.message : String(e);
      }
      if (cancelled) return;
      setUserRoot(uRoot);
      setProjectRoot(pRoot);
      setUserSkills(nextUser);
      setProjectSkills(nextProject);
      setCatalog(nextCatalog);
      setCatalogError(nextCatErr);
    })();
    return () => {
      cancelled = true;
    };
  }, [app, refreshTick]);
  async function handleUninstall(record) {
    if (busy) return;
    if (!window.confirm(`Uninstall ${record.displayName}?`)) return;
    setBusy(true);
    setBusyId(record.id);
    try {
      await uninstall(app, record);
      setRefreshTick((tick) => tick + 1);
    } catch (e) {
      window.alert(`Uninstall failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
      setBusyId(null);
    }
  }
  async function handleInstall(entry, scope) {
    if (busy) return;
    const root = scope === "user" ? userRoot : projectRoot;
    if (!root) {
      window.alert(
        scope === "project" ? "Project skills root not configured. Set it in Settings first." : "User scope unavailable."
      );
      return;
    }
    setBusy(true);
    setBusyId(entry.id);
    const finalTarget = `${root}${sep}${entry.id}`;
    const tmpDir = `${root}${sep}.tmp-install-${entry.id}-${Date.now()}`;
    try {
      const { canonicalDir } = await cloneAtSha(app, {
        gitUrl: entry.gitUrl,
        sha: entry.sha,
        tmpDir
      });
      const receipt = await validateAndIssueReceipt(app, {
        entry,
        repoDir: canonicalDir,
        scope,
        finalTarget
      });
      await commit(app, {
        entry,
        repoDir: canonicalDir,
        receipt,
        overwrite: true
      });
      try {
        await app.fs.rm(tmpDir, { recursive: true, force: true });
      } catch {
      }
      setRefreshTick((tick) => tick + 1);
    } catch (e) {
      try {
        await app.fs.rm(tmpDir, { recursive: true, force: true });
      } catch {
      }
      window.alert(
        `Install failed: ${e instanceof Error ? e.message : String(e)}`
      );
    } finally {
      setBusy(false);
      setBusyId(null);
    }
  }
  const userInstalledById = /* @__PURE__ */ new Map();
  for (const r of userSkills ?? []) userInstalledById.set(r.id, r);
  const projectInstalledById = /* @__PURE__ */ new Map();
  for (const r of projectSkills ?? []) projectInstalledById.set(r.id, r);
  return h(
    "div",
    {
      role: "region",
      "aria-label": "Continuo CLAUDE Code skills manager",
      style: styles.region
    },
    // User scope
    h(
      "section",
      { "data-testid": "user-scope-section" },
      h("h3", { style: styles.sectionTitleFirst }, `User scope (${(userSkills ?? []).length})`),
      (userSkills ?? []).length === 0 ? h("div", { style: styles.emptyMsg }, "No skills installed in User scope.") : (userSkills ?? []).map(
        (r) => skillCard(r, "user", busy, busyId, handleUninstall)
      )
    ),
    // Project scope
    h(
      "section",
      {
        "data-testid": "project-scope-section",
        "aria-disabled": projectRoot === null
      },
      h("h3", { style: styles.sectionTitle }, `Project scope${projectRoot ? ` (${(projectSkills ?? []).length})` : ""}`),
      projectRoot === null ? h(
        "div",
        {
          "data-testid": "project-disabled-msg",
          style: styles.cardDisabled
        },
        "Configure Project skills root in Settings or open a git-backed workspace."
      ) : (projectSkills ?? []).length === 0 ? h("div", { style: styles.emptyMsg }, "No skills installed in Project scope.") : (projectSkills ?? []).map(
        (r) => skillCard(r, "project", busy, busyId, handleUninstall)
      )
    ),
    // Catalog
    h(
      "section",
      { "data-testid": "catalog-section" },
      h("h3", { style: styles.sectionTitle }, `Catalog${catalog ? ` (${catalog.entries.length})` : ""}`),
      catalogError && h(
        "div",
        { style: styles.errorBox, "data-testid": "catalog-error" },
        catalogError
      ),
      catalog && catalog.entries.length === 0 && h("div", { style: styles.emptyMsg }, "Catalog is empty."),
      catalog && catalog.entries.map(
        (entry) => catalogCard(
          entry,
          userInstalledById.get(entry.id) ?? null,
          projectInstalledById.get(entry.id) ?? null,
          projectRoot !== null,
          busy,
          busyId,
          handleInstall,
          handleUninstall
        )
      )
    )
  );
}

// src/ui/SettingsTab.ts
var { React: React2 } = co;
var h2 = React2.createElement;
var styles2 = {
  region: {
    height: "100%",
    overflowY: "auto",
    boxSizing: "border-box",
    padding: 16,
    color: "var(--md-fg, #e6e6e6)",
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontSize: 12
  },
  section: {
    border: "1px solid var(--md-line, #2a2a2a)",
    background: "var(--md-panel, #1a1a1a)",
    borderRadius: 6,
    padding: 16,
    marginBottom: 12
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--md-fg, #e6e6e6)",
    margin: "0 0 6px"
  },
  sectionHint: {
    fontSize: 11,
    color: "var(--md-fg-muted, #9a9a9a)",
    margin: "0 0 12px"
  },
  inputRow: {
    display: "flex",
    gap: 8,
    alignItems: "center",
    marginBottom: 8
  },
  input: {
    flex: 1,
    minWidth: 0,
    background: "var(--md-panel-soft, #0e0e0e)",
    border: "1px solid var(--md-line, #2a2a2a)",
    borderRadius: 4,
    color: "var(--md-fg, #e6e6e6)",
    padding: "6px 10px",
    fontSize: 12,
    fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace",
    outline: "none"
  },
  btnPrimary: {
    border: "none",
    borderRadius: 4,
    padding: "6px 14px",
    fontSize: 11,
    fontWeight: 500,
    cursor: "pointer",
    whiteSpace: "nowrap",
    background: "var(--md-accent, #4a7afd)",
    color: "#fff"
  },
  btnGhost: {
    border: "1px solid var(--md-line, #3a3a3a)",
    borderRadius: 4,
    padding: "6px 14px",
    fontSize: 11,
    fontWeight: 500,
    cursor: "pointer",
    whiteSpace: "nowrap",
    background: "transparent",
    color: "var(--md-fg-muted, #aaa)"
  },
  effectiveLine: {
    fontSize: 11,
    color: "var(--md-fg-dim, #6a6a6a)",
    margin: "6px 0 0",
    fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace",
    wordBreak: "break-all"
  },
  banner: {
    background: "#3a2a10",
    border: "1px solid #6b5020",
    color: "#d4a04a",
    borderRadius: 4,
    padding: "8px 12px",
    fontSize: 11,
    marginBottom: 12
  },
  savedMsg: {
    fontSize: 10,
    color: "var(--md-fg-dim, #6a6a6a)",
    marginTop: 8
  }
};
function SettingsTab({ app }) {
  const [catalogUrl, setCatalogUrl] = React2.useState("");
  const [catalogInput, setCatalogInput] = React2.useState("");
  const [workspaceRoot, setWorkspaceRoot] = React2.useState(null);
  const [projectSkillsRoot, setProjectSkillsRoot] = React2.useState(null);
  const [savedAt, setSavedAt] = React2.useState(null);
  React2.useEffect(() => {
    let cancelled = false;
    (async () => {
      const url = await getCatalogUrl(app);
      const ws = await app.workspace.getRoot();
      const psr = await resolveProjectScope(app);
      if (cancelled) return;
      setCatalogUrl(url);
      setCatalogInput(url);
      setWorkspaceRoot(ws);
      setProjectSkillsRoot(psr);
    })();
    return () => {
      cancelled = true;
    };
  }, [app]);
  async function saveCatalogUrl(url) {
    await setUserCatalogUrlOverride(app, url);
    const effective = await getCatalogUrl(app);
    setCatalogUrl(effective);
    setCatalogInput(effective);
    setSavedAt(Date.now());
  }
  const showPlaceholderBanner = isPlaceholderCatalogUrl(catalogUrl);
  return h2(
    "div",
    {
      role: "region",
      "aria-label": "Continuo CLAUDE Code skills manager Settings",
      style: styles2.region
    },
    showPlaceholderBanner && h2(
      "div",
      {
        role: "alert",
        "data-testid": "placeholder-banner",
        style: styles2.banner
      },
      "Configure catalog URL \u2014 the default contains a placeholder."
    ),
    // Catalog URL
    h2(
      "section",
      { "data-testid": "catalog-url-section", style: styles2.section },
      h2("h3", { style: styles2.sectionTitle }, "Catalog URL"),
      h2(
        "p",
        { style: styles2.sectionHint },
        "GitHub raw JSON URL the plugin fetches catalog entries from."
      ),
      h2(
        "div",
        { style: styles2.inputRow },
        h2("input", {
          type: "text",
          value: catalogInput,
          onChange: (event) => setCatalogInput(event.target.value),
          placeholder: "https://raw.githubusercontent.com/...",
          "data-testid": "catalog-url-input",
          style: styles2.input
        }),
        h2(
          "button",
          {
            onClick: () => saveCatalogUrl(catalogInput),
            "data-testid": "save-catalog-url-btn",
            style: styles2.btnPrimary
          },
          "Save"
        ),
        h2(
          "button",
          {
            onClick: () => saveCatalogUrl(null),
            "data-testid": "reset-catalog-url-btn",
            style: styles2.btnGhost
          },
          "Reset to default"
        )
      ),
      h2("p", { style: styles2.effectiveLine }, `Effective: ${catalogUrl}`)
    ),
    // Project scope (auto from workspace)
    h2(
      "section",
      { "data-testid": "project-cwd-section", style: styles2.section },
      h2("h3", { style: styles2.sectionTitle }, "Project skills root (auto)"),
      h2(
        "p",
        { style: styles2.sectionHint },
        "Project scope tracks the current Continuo window\u2019s workspace root. Open a git-backed folder in the explorer; skills install to <workspace>/.claude/skills/. No manual configuration."
      ),
      h2(
        "p",
        { style: styles2.effectiveLine, "data-testid": "workspace-line" },
        `Workspace: ${workspaceRoot ?? "(no folder open)"}`
      ),
      h2(
        "p",
        { style: styles2.effectiveLine, "data-testid": "project-skills-line" },
        `Project skills root: ${projectSkillsRoot ?? "(unavailable \u2014 open a git-backed workspace)"}`
      ),
      h2(
        "p",
        {
          style: {
            ...styles2.sectionHint,
            margin: "8px 0 0",
            fontStyle: "italic"
          }
        },
        workspaceRoot && !projectSkillsRoot ? "Workspace is open but git rev-parse failed \u2014 folder isn\u2019t a git repo, so Project scope is disabled." : "After switching workspaces, close and reopen the Skills panel to refresh Project buttons."
      )
    ),
    savedAt !== null && h2(
      "p",
      { "data-testid": "saved-msg", style: styles2.savedMsg },
      `Saved at ${new Date(savedAt).toLocaleTimeString()}`
    )
  );
}

// src/main.ts
var { Plugin, React: React3 } = co;
function makeScopedApp(app, pluginId) {
  const realDataStore = app.dataStore;
  return {
    ...app,
    dataStore: {
      load: async () => {
        const v = await realDataStore.read(pluginId);
        return v ?? {};
      },
      save: async (data) => {
        await realDataStore.write(pluginId, data);
      }
    }
  };
}
var SkillsManagerPlugin = class extends Plugin {
  constructor(app, manifest) {
    super(app, manifest);
  }
  async onload() {
    const scopedApp = makeScopedApp(this.app, this.manifest.id);
    try {
      const panel = this.app.panels.register({
        type: "skills-manager",
        title: "Skills",
        factory: () => React3.createElement(PanelMain, { app: scopedApp })
      });
      this.disposables.push(panel);
      const settingTab = this.app.settingTabs.register({
        id: "skills-manager-settings",
        title: "Continuo CLAUDE Code skills manager",
        render: () => React3.createElement(SettingsTab, { app: scopedApp })
      });
      this.disposables.push(settingTab);
    } catch (err) {
      console.warn(
        "[skills-manager] onload error, registering degraded settings tab",
        err
      );
      const fallback = this.app.settingTabs.register({
        id: "skills-manager-settings-error",
        title: "Continuo CLAUDE Code skills manager (degraded)",
        render: () => React3.createElement(
          "div",
          { "data-testid": "degraded-banner", role: "alert" },
          `Continuo CLAUDE Code skills manager failed to start: ${err.message}`
        )
      });
      this.disposables.push(fallback);
    }
  }
  async onunload() {
    for (const disposable of this.disposables.reverse()) {
      try {
        disposable.dispose();
      } catch {
      }
    }
    this.disposables = [];
  }
  disposables = [];
};
export {
  SkillsManagerPlugin as default
};
//# sourceMappingURL=main.js.map
