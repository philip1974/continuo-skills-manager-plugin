export type PreviewState =
  | 'closed'
  | 'previewing'
  | 'scrolledToBottom'
  | 'checkboxAcknowledged'
  | 'validating'
  | 'validated'
  | 'committing'
  | 'committed'
  | 'errorHashMismatch'
  | 'errorClone'
  | 'errorCommit'
  | 'staleReceipt';

export type PreviewEvent =
  | { type: 'open' }
  | { type: 'scrolledToBottom' }
  | { type: 'checkboxToggle'; value: boolean }
  | { type: 'confirmClicked' }
  | { type: 'validateSuccess' }
  | { type: 'validateFailHash' }
  | { type: 'validateFailClone' }
  | { type: 'commitClicked' }
  | { type: 'commitSuccess' }
  | { type: 'commitFail' }
  | { type: 'commitFailExpiredReceipt' }
  | { type: 'reopenPreview' }
  | { type: 'close' };

const TRANSITIONS: {
  [S in PreviewState]?: { [E in PreviewEvent['type']]?: PreviewState };
} = {
  closed: {
    open: 'previewing',
  },
  previewing: {
    scrolledToBottom: 'scrolledToBottom',
    close: 'closed',
  },
  scrolledToBottom: {
    checkboxToggle: 'checkboxAcknowledged',
    close: 'closed',
  },
  checkboxAcknowledged: {
    checkboxToggle: 'scrolledToBottom',
    confirmClicked: 'validating',
    close: 'closed',
  },
  validating: {
    validateSuccess: 'validated',
    validateFailHash: 'errorHashMismatch',
    validateFailClone: 'errorClone',
  },
  validated: {
    commitClicked: 'committing',
    close: 'closed',
  },
  committing: {
    commitSuccess: 'committed',
    commitFail: 'errorCommit',
    commitFailExpiredReceipt: 'staleReceipt',
  },
  committed: {
    close: 'closed',
  },
  errorHashMismatch: { reopenPreview: 'previewing' },
  errorClone: { reopenPreview: 'previewing' },
  errorCommit: { reopenPreview: 'previewing' },
  staleReceipt: { reopenPreview: 'previewing' },
};

export function reduce(state: PreviewState, event: PreviewEvent): PreviewState {
  if (event.type === 'checkboxToggle') {
    if (state === 'scrolledToBottom' && event.value === true) {
      return 'checkboxAcknowledged';
    }
    if (state === 'checkboxAcknowledged' && event.value === false) {
      return 'scrolledToBottom';
    }
    return state;
  }

  const next = TRANSITIONS[state]?.[event.type];
  return next ?? state;
}

export function listAllStates(): PreviewState[] {
  return [
    'closed',
    'previewing',
    'scrolledToBottom',
    'checkboxAcknowledged',
    'validating',
    'validated',
    'committing',
    'committed',
    'errorHashMismatch',
    'errorClone',
    'errorCommit',
    'staleReceipt',
  ];
}

export const TRAP_STATES: ReadonlySet<PreviewState> = new Set([
  'errorHashMismatch',
  'errorClone',
  'errorCommit',
  'staleReceipt',
]);
