import { describe, expect, it } from 'vitest';
import { listAllStates, reduce, TRAP_STATES, type PreviewState } from './fsm';

describe('PreviewDrawer FSM', () => {
  it('runs the happy path from closed through committed and back to closed', () => {
    let state: PreviewState = 'closed';
    state = reduce(state, { type: 'open' });
    expect(state).toBe('previewing');
    state = reduce(state, { type: 'scrolledToBottom' });
    expect(state).toBe('scrolledToBottom');
    state = reduce(state, { type: 'checkboxToggle', value: true });
    expect(state).toBe('checkboxAcknowledged');
    state = reduce(state, { type: 'confirmClicked' });
    expect(state).toBe('validating');
    state = reduce(state, { type: 'validateSuccess' });
    expect(state).toBe('validated');
    state = reduce(state, { type: 'commitClicked' });
    expect(state).toBe('committing');
    state = reduce(state, { type: 'commitSuccess' });
    expect(state).toBe('committed');
    state = reduce(state, { type: 'close' });
    expect(state).toBe('closed');
  });

  it('ignores checkbox toggle before scrolling to bottom', () => {
    expect(reduce('previewing', { type: 'checkboxToggle', value: true })).toBe(
      'previewing',
    );
  });

  it('returns from checkboxAcknowledged to scrolledToBottom when unchecked', () => {
    expect(
      reduce('checkboxAcknowledged', { type: 'checkboxToggle', value: false }),
    ).toBe('scrolledToBottom');
  });

  it('ignores confirm clicks before checkbox acknowledgement', () => {
    expect(reduce('previewing', { type: 'confirmClicked' })).toBe('previewing');
  });

  it.each([...TRAP_STATES])(
    'keeps %s trapped on invalid events',
    (state) => {
      expect(reduce(state, { type: 'commitSuccess' })).toBe(state);
      expect(reduce(state, { type: 'close' })).toBe(state);
    },
  );

  it.each([...TRAP_STATES])('exits %s only by reopenPreview', (state) => {
    expect(reduce(state, { type: 'reopenPreview' })).toBe('previewing');
  });

  it('routes expired receipts through staleReceipt trap', () => {
    let state: PreviewState = 'committing';
    state = reduce(state, { type: 'commitFailExpiredReceipt' });
    expect(state).toBe('staleReceipt');
    state = reduce(state, { type: 'reopenPreview' });
    expect(state).toBe('previewing');
  });

  it('has exactly four trap states', () => {
    expect(TRAP_STATES.size).toBe(4);
  });

  it('lists all twelve states', () => {
    expect(listAllStates()).toHaveLength(12);
  });

  it('routes validation failures into clone and hash traps', () => {
    expect(reduce('validating', { type: 'validateFailHash' })).toBe(
      'errorHashMismatch',
    );
    expect(reduce('validating', { type: 'validateFailClone' })).toBe('errorClone');
  });

  it('routes commit failure into errorCommit trap', () => {
    expect(reduce('committing', { type: 'commitFail' })).toBe('errorCommit');
  });
});
