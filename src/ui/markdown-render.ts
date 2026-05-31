// Zero-dependency markdown -> DOM renderer.
//
// Trust: never use innerHTML. document.createElement + textContent only.
// HTML literals render as text. Links become inert spans. Images become text.

const SAFE_PROTOCOLS = new Set(['http:', 'https:']);

function isSafeUrl(url: string): boolean {
  if (/[\u0000-\u001f\u007f]/.test(url)) return false;
  try {
    const parsed = new URL(url);
    return SAFE_PROTOCOLS.has(parsed.protocol);
  } catch {
    return false;
  }
}

function renderInlineInto(parent: Element, text: string): void {
  const codeRe = /`([^`\n]+)`/g;
  let lastEnd = 0;
  let match: RegExpExecArray | null;
  while ((match = codeRe.exec(text)) !== null) {
    if (match.index > lastEnd) {
      renderInlineNonCode(parent, text.slice(lastEnd, match.index));
    }
    const code = document.createElement('code');
    code.textContent = match[1]!;
    parent.appendChild(code);
    lastEnd = match.index + match[0].length;
  }
  if (lastEnd < text.length) {
    renderInlineNonCode(parent, text.slice(lastEnd));
  }
}

function renderInlineNonCode(parent: Element, text: string): void {
  let i = 0;
  let buf = '';
  const flushBuf = () => {
    if (buf) {
      parent.appendChild(document.createTextNode(buf));
      buf = '';
    }
  };

  while (i < text.length) {
    const ch = text[i]!;

    if (ch === '!' && text[i + 1] === '[') {
      const closeBracket = text.indexOf(']', i + 2);
      if (closeBracket !== -1 && text[closeBracket + 1] === '(') {
        const closeParen = text.indexOf(')', closeBracket + 2);
        if (closeParen !== -1) {
          const alt = text.slice(i + 2, closeBracket);
          flushBuf();
          parent.appendChild(document.createTextNode(`[image: ${alt}]`));
          i = closeParen + 1;
          continue;
        }
      }
    }

    if (ch === '[') {
      const closeBracket = text.indexOf(']', i + 1);
      if (closeBracket !== -1 && text[closeBracket + 1] === '(') {
        const closeParen = text.indexOf(')', closeBracket + 2);
        if (closeParen !== -1) {
          const linkText = text.slice(i + 1, closeBracket);
          const url = text.slice(closeBracket + 2, closeParen);
          flushBuf();
          const span = document.createElement('span');
          span.className = 'inert-link';
          if (isSafeUrl(url)) {
            span.setAttribute('data-href', url);
          }
          span.textContent = linkText;
          parent.appendChild(span);
          i = closeParen + 1;
          continue;
        }
      }
    }

    buf += ch;
    i++;
  }
  flushBuf();
}

export function renderMarkdownToDOM(md: string): DocumentFragment {
  const frag = document.createDocumentFragment();
  const lines = md.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;

    if (line.startsWith('```')) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.startsWith('```')) {
        codeLines.push(lines[i]!);
        i++;
      }
      const pre = document.createElement('pre');
      const code = document.createElement('code');
      if (lang) code.setAttribute('data-lang', lang);
      code.textContent = codeLines.join('\n');
      pre.appendChild(code);
      frag.appendChild(pre);
      i++;
      continue;
    }

    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1]!.length;
      const h = document.createElement(`h${level}`);
      renderInlineInto(h, headingMatch[2]!);
      frag.appendChild(h);
      i++;
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const ul = document.createElement('ul');
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i]!)) {
        const item = lines[i]!.replace(/^\s*[-*]\s+/, '');
        const li = document.createElement('li');
        renderInlineInto(li, item);
        ul.appendChild(li);
        i++;
      }
      frag.appendChild(ul);
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const ol = document.createElement('ol');
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i]!)) {
        const item = lines[i]!.replace(/^\s*\d+\.\s+/, '');
        const li = document.createElement('li');
        renderInlineInto(li, item);
        ol.appendChild(li);
        i++;
      }
      frag.appendChild(ol);
      continue;
    }

    if (line.trim() === '') {
      i++;
      continue;
    }

    const p = document.createElement('p');
    renderInlineInto(p, line);
    frag.appendChild(p);
    i++;
  }

  return frag;
}

export function applyPreviewBodyStyle(container: HTMLElement): void {
  container.style.unicodeBidi = 'plaintext';
  container.style.wordBreak = 'break-word';
}
