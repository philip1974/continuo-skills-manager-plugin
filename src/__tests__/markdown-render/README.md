# markdown-render

零依赖 markdown -> DOM renderer for Skills Manager Plugin PreviewDrawer。继承 react-markdown 的 trust 加固语义,所有 HTML 标签字面转义,链接退化为 inert span (不可点),图片不渲染。

## Trust 边界
- 全部用 `document.createElement` + `textContent`,**绝不** `innerHTML`
- a -> `<span class="inert-link" data-href="<url>">text</span>` 无 href
- img -> 字面文本 `[image: <alt>]`,无 img 元素
- HTML 标签字面 — `<script>` / `<iframe>` / 任何 `<` `>` `&` 由 textContent 自然转义

## 支持
- Block: h1/h2/h3 / paragraph / unordered list ul>li / ordered list ol>li / fenced code <pre><code>
- Inline: bold / italic / inline-code / link (inert) / image (placeholder)

## 测试
- 8 happy + 12 trust = 20 cases
- 用 jsdom 验 DOM 结构 + 字面 textContent
