# path-polyfill

零依赖 POSIX-only path string utils。替代 topic-03 用的 `node:path` (renderer CSP 拒)。

## API (POSIX only)
- `sep: '/'`
- `basename(p)` `dirname(p)` `normalize(p)` `join(...parts)`

## Spec
对照 `node:path.posix` 实测输出。table-driven + seeded fuzz (mulberry32 0xC0FFEE)。

## Trust 边界
- 纯字符串操作,zero-dep
- **POSIX-only**,不支持 Windows path 分隔符
- 顶部 `@vitest-environment node` 让该 spec 能 import node:path (parity 测试)
