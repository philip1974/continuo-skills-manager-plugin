// @vitest-environment jsdom

import { describe, it, expect } from 'vitest';
import { renderMarkdownToDOM, applyPreviewBodyStyle } from '../../ui/markdown-render';

function renderInto(md: string): HTMLElement {
  const container = document.createElement('div');
  container.appendChild(renderMarkdownToDOM(md));
  return container;
}

describe('markdown-render — happy path (8 cases)', () => {
  it('H1: # Title → <h1>Title</h1>', () => {
    const out = renderInto('# Title');
    const h1 = out.querySelector('h1');
    expect(h1).not.toBeNull();
    expect(h1?.textContent).toBe('Title');
  });

  it('H2: ## Sub → <h2>Sub</h2>', () => {
    const out = renderInto('## Sub');
    expect(out.querySelector('h2')?.textContent).toBe('Sub');
  });

  it('H3: ### Item → <h3>Item</h3>', () => {
    const out = renderInto('### Item');
    expect(out.querySelector('h3')?.textContent).toBe('Item');
  });

  it('Paragraph: plain text → <p>', () => {
    const out = renderInto('Hello world.');
    expect(out.querySelector('p')?.textContent).toBe('Hello world.');
  });

  it('Unordered list: - a / - b → <ul><li>', () => {
    const out = renderInto('- a\n- b');
    const items = out.querySelectorAll('ul > li');
    expect(items.length).toBe(2);
    expect(items[0]?.textContent).toBe('a');
    expect(items[1]?.textContent).toBe('b');
  });

  it('Ordered list: 1. a / 2. b → <ol><li>', () => {
    const out = renderInto('1. a\n2. b');
    const items = out.querySelectorAll('ol > li');
    expect(items.length).toBe(2);
    expect(items[0]?.textContent).toBe('a');
  });

  it('Inline code: `foo` → <code>foo</code>', () => {
    const out = renderInto('Run `foo` now');
    expect(out.querySelector('code')?.textContent).toBe('foo');
  });

  it('Fenced code: ```js / x / ``` → <pre><code>', () => {
    const out = renderInto('```js\nconst x = 1;\n```');
    const pre = out.querySelector('pre > code');
    expect(pre?.textContent).toContain('const x = 1;');
  });
});

describe('markdown-render — trust vectors (12 cases)', () => {
  it('T1 — <script>: literal tag, no script element', () => {
    const out = renderInto('<script>alert(1)</script>');
    expect(out.querySelector('script')).toBeNull();
    expect(out.textContent).toContain('<script>');
  });

  it('T2 — <img onerror=>: no img element, literal text', () => {
    const out = renderInto('<img onerror="alert(1)" src=x>');
    expect(out.querySelector('img')).toBeNull();
    expect(out.textContent).toContain('<img');
  });

  it('T3 — [click](javascript:): inert span, no href', () => {
    const out = renderInto('[click](javascript:alert(1))');
    expect(out.querySelector('a[href]')).toBeNull();
    const span = out.querySelector('span.inert-link');
    expect(span?.textContent).toBe('click');
    expect(span?.getAttribute('href')).toBeNull();
  });

  it('T4 — ![logo](data:text/html,..): no img, placeholder text', () => {
    const out = renderInto('![logo](data:text/html,<script>alert(1)</script>)');
    expect(out.querySelector('img')).toBeNull();
    expect(out.textContent).toContain('[image: logo]');
  });

  it('T5 — nested HTML literal: textContent has <b>world</b>', () => {
    const out = renderInto('Hello <b>world</b>');
    expect(out.querySelector('b')).toBeNull();
    expect(out.textContent).toContain('<b>world</b>');
  });

  it('T6 — reference-style javascript: [x][1] / [1]: javascript:', () => {
    const out = renderInto('See [x][1] now\n\n[1]: javascript:alert(1)');
    expect(out.querySelector('a[href]')).toBeNull();
    expect(out.querySelector('span.inert-link[data-href*="javascript"]')).toBeNull();
  });

  it('T7 — newline-split URL: [x](java\\nscript:...)', () => {
    const out = renderInto('[x](java\nscript:alert(1))');
    expect(out.querySelector('a[href]')).toBeNull();
  });

  it('T8 — attribute injection: [x](https://ok" onclick="alert(1))', () => {
    const out = renderInto('[x](https://ok" onclick="alert(1))');
    expect(out.querySelector('a[href]')).toBeNull();
    expect(out.querySelector('[onclick]')).toBeNull();
    expect(out.querySelectorAll('a').length).toBe(0);
  });

  it('T9 — bidi override: U+202E literal kept; style applied', () => {
    const out = renderInto('abc‮def');
    expect(out.textContent).toContain('‮');
    const container = document.createElement('div');
    applyPreviewBodyStyle(container);
    expect(container.style.unicodeBidi).toBe('plaintext');
  });

  it('T10 — fenced code break: </code><script> literal in code block', () => {
    const out = renderInto('```\n</code><script>alert(1)</script>\n```');
    expect(out.querySelector('script')).toBeNull();
    expect(out.textContent).toContain('<script>');
  });

  it('T11 — autolink javascript: <javascript:..> no clickable', () => {
    const out = renderInto('<javascript:alert(1)>');
    expect(out.querySelector('a[href]')).toBeNull();
  });

  it('T12 — nested image-link: [![x](javascript:1)](javascript:2): no a, no img', () => {
    const out = renderInto('[![x](javascript:1)](javascript:2)');
    expect(out.querySelector('a[href]')).toBeNull();
    expect(out.querySelector('img')).toBeNull();
  });
});
