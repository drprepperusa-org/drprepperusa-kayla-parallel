/**
 * Base API client for PrepShip backend.
 * Provides typed request helper + ApiError for React Query consumers.
 */

import type { OrderDTO, ListOrdersResponse, StoreDTO } from '../types/orders';
import type { MarkupsMap } from '../types/markups';

// Base URL from env
const API_BASE = (import.meta.env as Record<string, string>).PUBLIC_API_BASE ?? '/api';

// ---------------------------------------------------------------------------
// ApiError — structured error for query/mutation error handling
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// ---------------------------------------------------------------------------
// apiRequest — generic fetch helper used by all hooks and the legacy apiClient
// ---------------------------------------------------------------------------

export async function apiRequest<T>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  options?: {
    body?: unknown;
    query?: Record<string, string | number | boolean | undefined | null>;
  }
): Promise<T> {
  const url = new URL(`${API_BASE}${path}`, window.location.origin);

  if (options?.query) {
    for (const [key, value] of Object.entries(options.query)) {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, String(value));
      }
    }
  }

  const proxyApiKey = (import.meta.env as Record<string, string>).PUBLIC_PROXY_API_KEY ?? '';

  const response = await fetch(url.toString(), {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': proxyApiKey,
    },
    body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    let code = 'UNKNOWN_ERROR';
    try {
      const json = JSON.parse(text) as { code?: string };
      code = json.code ?? code;
    } catch { /* ignore */ }
    throw new ApiError(response.status, code, `${method} ${path}: ${response.status} ${response.statusText}`);
  }

  if (response.status === 204) return undefined as unknown as T;
  return response.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// apiClient — named methods for components that haven't migrated to hooks yet
// ---------------------------------------------------------------------------

export const apiClient = {
  listOrders: (query: {
    page?: number;
    pageSize?: number;
    orderStatus?: string;
    storeId?: number;
    clientId?: number;
    dateStart?: string;
    dateEnd?: string;
  }) => apiRequest<ListOrdersResponse>('GET', '/orders', { query: query as Record<string, string | number | boolean | undefined> }),

  getOrderDetail: (orderId: number) => apiRequest<OrderDTO>('GET', `/orders/${orderId}`),

  listClients: () => apiRequest<StoreDTO[]>('GET', '/clients'),

  getStoreCounts: (status: string) =>
    apiRequest<Record<number, number>>('GET', '/orders/store-counts', { query: { orderStatus: status } }),

  getMarkups: () => apiRequest<MarkupsMap>('GET', '/settings/rbMarkups'),

  saveMarkups: (markups: MarkupsMap) => apiRequest<void>('PUT', '/settings/rbMarkups', { body: markups }),

  fetchRates: (payload: Record<string, unknown>) =>
    apiRequest<{ rates: unknown[] }>('POST', '/rates/fetch', { body: payload }),
};
