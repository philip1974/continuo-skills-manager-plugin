import { useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import type { CatalogEntry } from '../../types/data';
import { reduce, TRAP_STATES, type PreviewEvent, type PreviewState } from './fsm';

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
  const [state, setState] = useState<PreviewState>('previewing');
  const [checkboxChecked, setCheckboxChecked] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

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

  return (
    <div role="dialog" aria-label="Preview SKILL.md" data-state={state}>
      <header>
        <h2>{entry.name}</h2>
        <span aria-label="tree-hash">{canonicalHash.slice(0, 16)}...</span>
        <button onClick={onClose} aria-label="Close">
          x
        </button>
      </header>

      <div
        ref={contentRef}
        onScroll={onScroll}
        className="preview-content"
        data-testid="preview-content"
      >
        <ReactMarkdown
          skipHtml={true}
          rehypePlugins={[]}
          remarkPlugins={[]}
          allowedElements={[
            'p',
            'strong',
            'em',
            'code',
            'pre',
            'blockquote',
            'ul',
            'ol',
            'li',
            'h1',
            'h2',
            'h3',
            'h4',
            'h5',
            'h6',
            'table',
            'thead',
            'tbody',
            'tr',
            'th',
            'td',
            'del',
            'br',
            'hr',
            'a',
            'img',
          ]}
          components={{
            a: ({ children }) => (
              <span className="muted-link" data-testid="inert-link">
                {children}
              </span>
            ),
            img: () => null,
          }}
        >
          {markdownContent}
        </ReactMarkdown>
      </div>

      {inTrap && (
        <div role="alert" data-testid="error-banner" data-state={state}>
          {state === 'errorHashMismatch' && <p>Hash mismatch - install aborted.</p>}
          {state === 'errorClone' && <p>Clone failed - install aborted.</p>}
          {state === 'errorCommit' && <p>Commit failed - install aborted.</p>}
          {state === 'staleReceipt' && (
            <p>Validation receipt expired - please re-validate.</p>
          )}
          <button
            onClick={() => dispatch({ type: 'reopenPreview' })}
            data-testid="reopen-preview"
          >
            Re-open preview
          </button>
        </div>
      )}

      {!inTrap && state !== 'committed' && (
        <footer>
          <label
            data-testid="checkbox-label"
            style={{ opacity: state === 'previewing' ? 0.5 : 1 }}
          >
            <input
              type="checkbox"
              checked={checkboxChecked}
              disabled={state === 'previewing'}
              onChange={(event) => {
                setCheckboxChecked(event.target.checked);
                dispatch({ type: 'checkboxToggle', value: event.target.checked });
              }}
              data-testid="reviewed-checkbox"
            />
            I reviewed the full SKILL.md
          </label>
          <button
            disabled={confirmDisabled}
            onClick={handleConfirm}
            data-testid="confirm-install"
          >
            Confirm install
          </button>
        </footer>
      )}

      {state === 'committed' && (
        <p data-testid="committed-banner">Installed successfully.</p>
      )}
    </div>
  );
}
