// Vitest setupFile - injects globalThis.co BEFORE any spec module evaluates.
//
// MUST NOT import from '../types/sdk-shim'. sdk-shim has Proxy destructure that
// will throw if globalThis.co is not yet set, and importing it here would create
// a race with the assignment below.

import * as React from 'react';
import { z } from 'zod';

class PermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermissionError';
  }
}

class Plugin {
  app: any;
  manifest: any;

  constructor(app: any, manifest: any) {
    this.app = app;
    this.manifest = manifest;
  }

  async onload(): Promise<void> {}

  async onunload(): Promise<void> {}
}

(globalThis as any).co = {
  Plugin,
  React,
  z,
  PermissionError,
};
