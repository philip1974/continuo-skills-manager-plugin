// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CatalogEntry } from '../../types/data';
import { PreviewDrawer } from './index';

const entry: CatalogEntry = {
  id: 'skill',
  name: 'Skill',
  gitUrl: 'https://github.com/philip1974/repo',
  sha: 'a'.repeat(40),
  hash: 'b'.repeat(64),
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderDrawer(markdownContent = '# Skill', onCommit = vi.fn()) {
  return render(
    <PreviewDrawer
      entry={entry}
      markdownContent={markdownContent}
      canonicalHash={'c'.repeat(64)}
      onCommit={onCommit}
      onClose={vi.fn()}
    />,
  );
}

function scrollToBottom() {
  const el = screen.getByTestId('preview-content');
  Object.defineProperty(el, 'scrollHeight', { configurable: true, value: 100 });
  Object.defineProperty(el, 'clientHeight', { configurable: true, value: 50 });
  Object.defineProperty(el, 'scrollTop', { configurable: true, value: 49 });
  fireEvent.scroll(el);
}

describe('PreviewDrawer', () => {
  it('renders markdown links as inert spans while preserving link text', () => {
    const { container } = renderDrawer('[click me](javascript:alert(1))');
    expect(screen.getByTestId('inert-link').textContent).toBe('click me');
    expect(container.querySelector('a[href]')).toBeNull();
  });

  it('does not render raw HTML images', () => {
    const { container } = renderDrawer('<img src="http://evil/track.gif">');
    expect(container.querySelectorAll('img')).toHaveLength(0);
  });

  it('does not render raw script tags', () => {
    const { container } = renderDrawer('<script>alert(1)</script>');
    expect(container.querySelector('script')).toBeNull();
    expect(container.textContent).not.toContain('alert(1)');
  });

  it('does not render raw HTML anchors', () => {
    const { container } = renderDrawer('<a onclick="alert()">bad</a>');
    expect(container.querySelector('a')).toBeNull();
  });

  it('starts in previewing with confirm disabled', () => {
    renderDrawer();
    expect(screen.getByRole('dialog').getAttribute('data-state')).toBe('previewing');
    expect((screen.getByTestId('confirm-install') as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('keeps confirm disabled after scroll until checkbox is checked', async () => {
    renderDrawer();
    scrollToBottom();
    await waitFor(() => {
      expect(screen.getByRole('dialog').getAttribute('data-state')).toBe(
        'scrolledToBottom',
      );
    });
    expect((screen.getByTestId('confirm-install') as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('enables confirm after checkbox acknowledgement', async () => {
    renderDrawer();
    scrollToBottom();
    await waitFor(() => {
      expect(screen.getByRole('dialog').getAttribute('data-state')).toBe(
        'scrolledToBottom',
      );
    });
    await userEvent.click(screen.getByTestId('reviewed-checkbox'));
    await waitFor(() => {
      expect(screen.getByRole('dialog').getAttribute('data-state')).toBe(
        'checkboxAcknowledged',
      );
    });
    expect((screen.getByTestId('confirm-install') as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it('disables confirm again after checkbox is unticked', async () => {
    renderDrawer();
    scrollToBottom();
    await waitFor(() => {
      expect(screen.getByRole('dialog').getAttribute('data-state')).toBe(
        'scrolledToBottom',
      );
    });
    await userEvent.click(screen.getByTestId('reviewed-checkbox'));
    await userEvent.click(screen.getByTestId('reviewed-checkbox'));
    await waitFor(() => {
      expect(screen.getByRole('dialog').getAttribute('data-state')).toBe(
        'scrolledToBottom',
      );
    });
    expect((screen.getByTestId('confirm-install') as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('does not fetch remote markdown image resources', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('no'));
    const { container } = renderDrawer('![remote](http://evil/track.gif)');
    expect(container.querySelector('img')).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('shows a trap error banner and reopen button when commit fails', async () => {
    const onCommit = vi.fn(async () => {
      throw new Error('commit failed');
    });
    renderDrawer('# Skill', onCommit);
    scrollToBottom();
    await userEvent.click(screen.getByTestId('reviewed-checkbox'));
    await userEvent.click(screen.getByTestId('confirm-install'));
    await waitFor(() => {
      expect(screen.getByTestId('error-banner').getAttribute('data-state')).toBe(
        'errorCommit',
      );
    });
    expect(screen.getByTestId('reopen-preview')).not.toBeNull();
  });

  it('calls onCommit when confirm is clicked', async () => {
    const onCommit = vi.fn(async () => undefined);
    renderDrawer('# Skill', onCommit);
    scrollToBottom();
    await userEvent.click(screen.getByTestId('reviewed-checkbox'));
    await userEvent.click(screen.getByTestId('confirm-install'));
    expect(onCommit).toHaveBeenCalledTimes(1);
  });
});
