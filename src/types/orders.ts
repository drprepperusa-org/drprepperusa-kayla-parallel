/**
 * Order domain types — ported from prepship-v3
 */

import type { BillingCalculation } from '../utils/billingService';

export interface OrderItem {
  sku: string;
  quantity: number;
  name?: string;
  price?: number;
  imageUrl?: string;
  adjustment?: boolean;
}

export interface OrderDimensions {
  length: number;
  width: number;
  height: number;
}

export interface OrderWeight {
  value: number;
  units: 'ounces' | 'grams';
}

export interface OrderAddress {
  name?: string;
  company?: string;
  street1?: string;
  street2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

export interface Rate {
  shipmentId?: string;
  shippingProviderId: number;
  carrierCode: string;
  serviceCode: string;
  serviceName: string;
  amount: number;
  shipmentCost?: number;
  otherCost?: number;
  carrierNickname?: string | null;
  deliveryDays?: number | null;
  estimatedDelivery?: string | null;
  estimatedDeliveryDays?: number;
  surcharges?: Array<{ name: string; amount: number }>;
}

/**
 * Enriched rate selection — populated by the Rate Enrichment Pipeline (Feature 6).
 * Set on OrderDTO.enrichedRate after enrichOrdersWithRates() runs.
 */
export interface SelectedRate {
  carrierCode: string;
  serviceCode: string;
  /** Total rate in dollars (pre-markup). Post-markup cost added when Markup Chain ships. */
  rate: number;
  /** Timestamp when this rate was fetched from ShipStation. */
  fetchedAt: Date;
}

export interface OrderDTO {
  orderId: number;
  orderNumber: string;
  createdAt: string;
  updatedAt: string;
  clientId: number;
  storeId: number;
  shipTo?: OrderAddress;
  residential?: boolean;
  sourceResidential?: boolean;
  items?: OrderItem[];
  weight?: OrderWeight;
  dimensions?: OrderDimensions;
  selectedServiceCode?: string;
  selectedCarrierCode?: string;
  selectedShippingProviderId?: number;
  selectedRate?: Rate;
  billingProviderId?: number;
  orderTotal?: number;
  status: 'pending' | 'awaiting_shipment' | 'shipped' | 'cancelled';
  labelCreated?: string;
  trackingNumber?: string;
  printCount?: number;
  _enrichedWeight?: OrderWeight;
  _enrichedDims?: OrderDimensions;
  bestRate?: Rate;

  // --- Rate Enrichment Pipeline fields (Feature 6) ---
  /** Best rate selected by the enrichment pipeline. Set after enrichOrdersWithRates(). */
  enrichedRate?: SelectedRate;
  /** True once rate enrichment has been attempted for this order. */
  ratesFetched?: boolean;
  /** Error message if rate fetch failed. UI shows "rates unavailable" when set. */
  rateError?: string;

  // --- Billing Calculation fields (Feature 7) ---
  /** Final calculated cost for this order (post markup, banker's rounding). */
  calculatedCost?: number;
  /** Full billing calculation breakdown for finance audit trail. */
  billingCalculation?: BillingCalculation;

  // --- Label / State Machine fields (Feature 8) ---
  /** Label metadata — persisted when label is printed; triggers shipped state. */
  label?: {
    shippingNumber: string;   // Tracking number
    labelUrl: string;         // Link to label PDF
    carrierCode: string;      // 'USPS', 'UPS', 'FedEx'
    createdAt: Date;
    status: 'pending' | 'ready' | 'failed';
  };
}

export type OrderStatus = 'awaiting_shipment' | 'shipped' | 'cancelled';

export interface ColumnDef {
  key: string;
  label: string;
  width: number;
  sortable: boolean;
  defaultVisible: boolean;
}

export interface StoreDTO {
  clientId: number;
  name: string;
  storeIds: number[];
  platform?: string;
}

export interface ListOrdersResponse {
  orders: OrderDTO[];
  total: number;
  pages: number;
  currentPage: number;
  pageSize: number;
}
