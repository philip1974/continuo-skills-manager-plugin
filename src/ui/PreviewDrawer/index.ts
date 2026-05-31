import type { CatalogEntry } from '../../types/data';
import { co } from '../../types/sdk-shim';
import { applyPreviewBodyStyle, renderMarkdownToDOM } from '../markdown-render';
import { reduce, TRAP_STATES, type PreviewEvent, type PreviewState } from './fsm';

const { React } = co;
const h = React.createElement;

function stripExecutableHtml(markdown: string): string {
  return markdown.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
}

function markLegacyInertLinkTestIds(root: HTMLElement): void {
  for (const link of root.querySelectorAll('span.inert-link')) {
    link.setAttribute('data-testid', 'inert-link');
  }
}

interface PreviewDrawerProps {
  entry: CatalogEntry;
  markdownContent: string;
  canonicalHash: string;
  onCommit: () => Promise<void>;
  onClose: () => void;
}

export function PreviewDrawer({
  entry,
  markdownContent,
  canonicalHash,
  onCommit,
  onClose,
}: PreviewDrawerProps) {
  const [state, setState] = React.useState<PreviewState>('previewing');
  const [checkboxChecked, setCheckboxChecked] = React.useState(false);
  const contentRef = React.useRef<HTMLDivElement>(null);
  const bodyRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.replaceChildren(
        renderMarkdownToDOM(stripExecutableHtml(markdownContent)),
      );
      applyPreviewBodyStyle(bodyRef.current);
      markLegacyInertLinkTestIds(bodyRef.current);
    }
  }, [markdownContent]);

  function dispatch(event: PreviewEvent) {
    setState((prev) => reduce(prev, event));
  }

  function onScroll() {
    const el = contentRef.current;
    if (!el) return;
    if (
      state === 'previewing' &&
      el.scrollHeight - el.scrollTop - el.clientHeight < 4
    ) {
      dispatch({ type: 'scrolledToBottom' });
    }
  }

  async function handleConfirm() {
    dispatch({ type: 'confirmClicked' });
    dispatch({ type: 'validateSuccess' });
    dispatch({ type: 'commitClicked' });
    try {
      await onCommit();
      dispatch({ type: 'commitSuccess' });
    } catch {
      dispatch({ type: 'commitFail' });
    }
  }

  const confirmDisabled = state !== 'checkboxAcknowledged';
  const inTrap = TRAP_STATES.has(state);

  return h(
    'div',
    { role: 'dialog', 'aria-label': 'Preview SKILL.md', 'data-state': state },
    h(
      'header',
      null,
      h('h2', null, entry.name),
      h('span', { 'aria-label': 'tree-hash' }, `${canonicalHash.slice(0, 16)}...`),
      h('button', { onClick: onClose, 'aria-label': 'Close' }, 'x'),
    ),
    h(
      'div',
      {
        ref: contentRef,
        onScroll,
        className: 'preview-content',
        'data-testid': 'preview-content',
      },
      h('div', { ref: bodyRef, 'data-testid': 'preview-body' }),
    ),
    inTrap &&
      h(
        'div',
        { role: 'alert', 'data-testid': 'error-banner', 'data-state': state },
        state === 'errorHashMismatch' &&
          h('p', null, 'Hash mismatch - install aborted.'),
        state === 'errorClone' && h('p', null, 'Clone failed - install aborted.'),
        state === 'errorCommit' && h('p', null, 'Commit failed - install aborted.'),
        state === 'staleReceipt' &&
          h('p', null, 'Validation receipt expired - please re-validate.'),
        h(
          'button',
          {
            onClick: () => dispatch({ type: 'reopenPreview' }),
            'data-testid': 'reopen-preview',
          },
          'Re-open preview',
        ),
      ),
    !inTrap &&
      state !== 'committed' &&
      h(
        'footer',
        null,
        h(
          'label',
          {
            'data-testid': 'checkbox-label',
            style: { opacity: state === 'previewing' ? 0.5 : 1 },
          },
          h('input', {
            type: 'checkbox',
            checked: checkboxChecked,
            disabled: state === 'previewing',
            onChange: (event: { target: { checked: boolean } }) => {
              setCheckboxChecked(event.target.checked);
              dispatch({ type: 'checkboxToggle', value: event.target.checked });
            },
            'data-testid': 'reviewed-checkbox',
          }),
          'I reviewed the full SKILL.md',
        ),
        h(
          'button',
          {
            disabled: confirmDisabled,
            onClick: handleConfirm,
            'data-testid': 'confirm-install',
          },
          'Confirm install',
        ),
      ),
    state === 'committed' &&
      h('p', { 'data-testid': 'committed-banner' }, 'Installed successfully.'),
  );
}
