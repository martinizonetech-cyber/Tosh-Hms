export type DataMode = 'mock' | 'api';

const configuredMode = import.meta.env.VITE_DATA_MODE;
export const DATA_MODE: DataMode = configuredMode === 'mock' ? 'mock' : 'api';
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api/v1').replace(/\/$/, '');

export class DemoModeRequiredError extends Error {
  constructor() {
    super('This action requires demo mode. API mode never falls back to local mock data.');
    this.name = 'DemoModeRequiredError';
  }
}

export function requireDemoMode(): void {
  if (DATA_MODE !== 'mock') throw new DemoModeRequiredError();
}
