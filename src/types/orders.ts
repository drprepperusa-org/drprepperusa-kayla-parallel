/**
 * Order domain types — ported from prepship-v3
 */

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
