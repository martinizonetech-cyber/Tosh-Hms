export type DataMode = 'mock' | 'api';

const configuredMode = import.meta.env.VITE_DATA_MODE;
export const DATA_MODE: DataMode = configuredMode === 'mock' ? 'mock' : 'api';
function resolveApiBaseUrl(): string {
  const envUrl = (import.meta.env.VITE_API_BASE_URL || '').trim();
  if (!envUrl) {
    // Relative path defaults to Vite /api proxy for seamless local & network development
    return '/api/v1';
  }
  const clean = envUrl.replace(/\/+$/, '');
  if (!clean.endsWith('/api/v1')) {
    if (clean.endsWith('/api')) {
      return `${clean}/v1`;
    }
    return `${clean}/api/v1`;
  }
  return clean;
}

export const API_BASE_URL = resolveApiBaseUrl();

export class DemoModeRequiredError extends Error {
  constructor() {
    super('This action requires demo mode. API mode never falls back to local mock data.');
    this.name = 'DemoModeRequiredError';
  }
}

export function requireDemoMode(): void {
  if (DATA_MODE !== 'mock') throw new DemoModeRequiredError();
}
