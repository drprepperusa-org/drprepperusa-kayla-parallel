/**
 * API client for PrepShip backend
 * Uses demo/mock data when API is unavailable
 */

import type { OrderDTO, ListOrdersResponse, StoreDTO } from '../types/orders';
import type { MarkupsMap } from '../types/markups';

const API_BASE = import.meta.env.PUBLIC_API_BASE || '/api';

async function request<T>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  endpoint: string,
  options?: { body?: unknown; query?: Record<string, string | number | boolean | undefined> }
): Promise<T> {
  const url = new URL(`${API_BASE}${endpoint}`, window.location.origin);
  if (options?.query) {
    Object.entries(options.query).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, String(value));
      }
    });
  }

  const fetchOptions: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (options?.body) {
    fetchOptions.body = JSON.stringify(options.body);
  }

  const response = await fetch(url.toString(), fetchOptions);
  if (!response.ok) {
    throw new Error(`API ${method} ${endpoint}: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

export const apiClient = {
  listOrders: (query: {
    page?: number;
    pageSize?: number;
    orderStatus?: string;
    storeId?: number;
    clientId?: number;
    dateStart?: string;
    dateEnd?: string;
  }) => request<ListOrdersResponse>('GET', '/orders', { query: query as Record<string, string | number | boolean | undefined> }),

  getOrderDetail: (orderId: number) => request<OrderDTO>('GET', `/orders/${orderId}`),

  listClients: () => request<StoreDTO[]>('GET', '/clients'),

  getStoreCounts: (status: string) => request<Record<number, number>>('GET', '/orders/store-counts', { query: { orderStatus: status } }),

  getMarkups: () => request<MarkupsMap>('GET', '/settings/rbMarkups'),

  saveMarkups: (markups: MarkupsMap) => request<void>('PUT', '/settings/rbMarkups', { body: markups }),

  fetchRates: (payload: Record<string, unknown>) => request<{ rates: unknown[] }>('POST', '/rates/fetch', { body: payload }),
};
