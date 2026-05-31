// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

describe('sdk-adapter (globalThis.co Proxy bridge)', () => {
  it('C1 - globalThis.co is populated by setupFile', () => {
    expect((globalThis as any).co).toBeDefined();
    expect((globalThis as any).co.Plugin).toBeDefined();
    expect((globalThis as any).co.React).toBeDefined();
    expect((globalThis as any).co.z).toBeDefined();
    expect((globalThis as any).co.PermissionError).toBeDefined();
  });

  it('C2 - main.ts default export is globalThis.co.Plugin subclass', async () => {
    const mod = await import('../../main');
    const Cls = (mod as any).default;
    expect(typeof Cls).toBe('function');
    const instance = new Cls(
      {
        panels: { register: () => ({ dispose() {} }) },
        settingTabs: { register: () => ({ dispose() {} }) },
      },
      { id: 'x', main: 'dist/main.js' },
    );
    expect(instance).toBeInstanceOf((globalThis as any).co.Plugin);
  });

  it('C3 - sdk-shim co.React === globalThis.co.React (Proxy passthrough)', async () => {
    const { co } = await import('../../types/sdk-shim');
    expect(co.React).toBe((globalThis as any).co.React);
  });

  it('C4 - sdk-shim co.z === globalThis.co.z (Proxy passthrough)', async () => {
    const { co } = await import('../../types/sdk-shim');
    expect(co.z).toBe((globalThis as any).co.z);
  });

  it('C5 - setupFile state persists across spec accesses (no drift)', () => {
    const before = (globalThis as any).co;
    const after = (globalThis as any).co;
    expect(after).toBe(before);
  });

  it('C6 - Proxy throws when globalThis.co is missing (negative test)', async () => {
    const { co } = await import('../../types/sdk-shim');
    const saved = (globalThis as any).co;
    try {
      (globalThis as any).co = undefined;
      expect(() => co.Plugin).toThrow(/globalThis\.co not initialized/);
    } finally {
      (globalThis as any).co = saved;
    }
  });
});
