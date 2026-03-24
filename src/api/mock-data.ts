/**
 * Demo/mock data for standalone deployment
 */

import type { OrderDTO, StoreDTO } from '../types/orders';

export const MOCK_STORES: StoreDTO[] = [
  { clientId: 1, name: 'Amazon FBA', storeIds: [101, 102], platform: 'amazon' },
  { clientId: 2, name: 'Shopify Store', storeIds: [201], platform: 'shopify' },
  { clientId: 3, name: 'eBay Store', storeIds: [301], platform: 'ebay' },
  { clientId: 4, name: 'Walmart', storeIds: [401], platform: 'walmart' },
  { clientId: 5, name: 'TikTok Shop', storeIds: [501], platform: 'tiktok' },
];

const names = [
  'John Smith', 'Sarah Chen', 'Mike Wilson', 'Emma Davis', 'Robert Johnson',
  'Lisa Park', 'David Brown', 'Maria Garcia', 'James Lee', 'Amanda Taylor',
  'Chris Evans', 'Nicole Wang', 'Patrick Murphy', 'Rachel Kim', 'Brian Scott',
  'Jessica Liu', 'Andrew Martinez', 'Samantha White', 'Thomas Anderson', 'Olivia Moore',
];

const cities = [
  { city: 'Los Angeles', state: 'CA', zip: '90001' },
  { city: 'New York', state: 'NY', zip: '10001' },
  { city: 'Chicago', state: 'IL', zip: '60601' },
  { city: 'Houston', state: 'TX', zip: '77001' },
  { city: 'Phoenix', state: 'AZ', zip: '85001' },
  { city: 'Seattle', state: 'WA', zip: '98101' },
  { city: 'Miami', state: 'FL', zip: '33101' },
  { city: 'Denver', state: 'CO', zip: '80201' },
  { city: 'Atlanta', state: 'GA', zip: '30301' },
  { city: 'Portland', state: 'OR', zip: '97201' },
];

const skus = [
  'PREP-001', 'PREP-002', 'PREP-003', 'PREP-004', 'PREP-005',
  'SURV-101', 'SURV-102', 'SURV-103', 'MRE-201', 'MRE-202',
  'WATER-301', 'WATER-302', 'MED-401', 'MED-402', 'TOOL-501',
];

const itemNames = [
  '72-Hour Emergency Kit', 'Water Purification Tablets (100ct)', 'First Aid Kit - Premium',
  'Emergency Food Rations (3-Day)', 'Solar Crank Radio', 'Tactical Flashlight Pro',
  'Fire Starter Kit', 'Emergency Blanket (4-pack)', 'Survival Knife - Carbon Steel',
  'Paracord Bracelet (550lb)', 'Water Filter Straw', 'Emergency Shelter Tent',
  'MRE Variety Pack (12ct)', 'Portable Solar Panel 20W', 'Multi-Tool Premium',
];

const carriers = [
  { code: 'usps', name: 'USPS Priority Mail', providerId: 1 },
  { code: 'ups', name: 'UPS Ground', providerId: 2 },
  { code: 'fedex', name: 'FedEx Ground', providerId: 3 },
  { code: 'usps', name: 'USPS First Class', providerId: 1 },
  { code: 'ups', name: 'UPS 2nd Day Air', providerId: 2 },
];

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomDate(daysBack: number): string {
  const d = new Date();
  d.setDate(d.getDate() - Math.floor(Math.random() * daysBack));
  d.setHours(Math.floor(Math.random() * 24), Math.floor(Math.random() * 60));
  return d.toISOString();
}

function generateOrder(id: number, status: OrderDTO['status']): OrderDTO {
  const store = randomItem(MOCK_STORES);
  const city = randomItem(cities);
  const name = randomItem(names);
  const sku = randomItem(skus);
  const itemName = randomItem(itemNames);
  const carrier = randomItem(carriers);
  const qty = Math.floor(Math.random() * 5) + 1;
  const weight = Math.floor(Math.random() * 160) + 4; // 4oz to 164oz
  const price = parseFloat((Math.random() * 150 + 10).toFixed(2));
  const created = randomDate(status === 'shipped' ? 30 : 7);

  return {
    orderId: id,
    orderNumber: `ORD-${String(id).padStart(6, '0')}`,
    createdAt: created,
    updatedAt: created,
    clientId: store.clientId,
    storeId: store.storeIds[0],
    shipTo: {
      name,
      street1: `${Math.floor(Math.random() * 9999) + 1} Main St`,
      city: city.city,
      state: city.state,
      postalCode: city.zip,
      country: 'US',
    },
    residential: Math.random() > 0.3,
    items: [{ sku, quantity: qty, name: itemName, price }],
    weight: { value: weight, units: 'ounces' },
    dimensions: {
      length: Math.floor(Math.random() * 20) + 6,
      width: Math.floor(Math.random() * 15) + 4,
      height: Math.floor(Math.random() * 10) + 2,
    },
    selectedCarrierCode: status !== 'pending' ? carrier.code : undefined,
    selectedServiceCode: status !== 'pending' ? carrier.name : undefined,
    selectedShippingProviderId: status !== 'pending' ? carrier.providerId : undefined,
    orderTotal: price * qty,
    status,
    trackingNumber: status === 'shipped' ? `1Z${Math.random().toString(36).substr(2, 16).toUpperCase()}` : undefined,
    labelCreated: status === 'shipped' ? created : undefined,
    bestRate: {
      shippingProviderId: carrier.providerId,
      carrierCode: carrier.code,
      serviceCode: carrier.name,
      serviceName: carrier.name,
      amount: parseFloat((Math.random() * 15 + 3).toFixed(2)),
      shipmentCost: parseFloat((Math.random() * 12 + 2).toFixed(2)),
      otherCost: parseFloat((Math.random() * 3).toFixed(2)),
    },
  };
}

// Generate stable mock data
let mockOrders: OrderDTO[] | null = null;

function getMockOrders(): OrderDTO[] {
  if (mockOrders) return mockOrders;
  const orders: OrderDTO[] = [];
  let id = 1000;
  // 45 awaiting, 120 shipped, 15 cancelled
  for (let i = 0; i < 45; i++) orders.push(generateOrder(id++, 'awaiting_shipment'));
  for (let i = 0; i < 120; i++) orders.push(generateOrder(id++, 'shipped'));
  for (let i = 0; i < 15; i++) orders.push(generateOrder(id++, 'cancelled'));
  mockOrders = orders;
  return orders;
}

export function getMockOrdersByStatus(status: string, page = 1, pageSize = 50): {
  orders: OrderDTO[];
  total: number;
  pages: number;
  currentPage: number;
  pageSize: number;
} {
  const all = getMockOrders().filter(o => o.status === status);
  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  return {
    orders: all.slice(start, end),
    total: all.length,
    pages: Math.ceil(all.length / pageSize),
    currentPage: page,
    pageSize,
  };
}

export function getMockStoreCounts(status: string): Record<number, number> {
  const all = getMockOrders().filter(o => o.status === status);
  const counts: Record<number, number> = {};
  for (const order of all) {
    counts[order.storeId] = (counts[order.storeId] || 0) + 1;
  }
  return counts;
}
