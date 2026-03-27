import type { ColumnDef } from '../../types/orders';

/**
 * Column order (exact per DJ screenshots):
 * ☐ | AGE | CLIENT | ORDER# | RECIPIENT | ITEM/SKU | QTY | WEIGHT | SHIP TO | CARRIER
 */
export const ALL_COLUMNS: ColumnDef[] = [
  { key: 'select',    label: '',          width: 34,  sortable: false, defaultVisible: true  },
  { key: 'age',       label: 'Age',       width: 72,  sortable: true,  defaultVisible: true  },
  { key: 'client',    label: 'Client',    width: 110, sortable: true,  defaultVisible: true  },
  { key: 'orderNum',  label: 'Order #',   width: 100, sortable: true,  defaultVisible: true  },
  { key: 'customer',  label: 'Recipient', width: 175, sortable: true,  defaultVisible: true  },
  { key: 'itemsku',   label: 'Item/SKU',  width: 180, sortable: true,  defaultVisible: true  },
  { key: 'qty',       label: 'Qty',       width: 44,  sortable: true,  defaultVisible: true  },
  { key: 'weight',    label: 'Weight',    width: 72,  sortable: true,  defaultVisible: true  },
  { key: 'shipto',    label: 'Ship To',   width: 130, sortable: true,  defaultVisible: true  },
  { key: 'carrier',   label: 'Carrier',   width: 110, sortable: true,  defaultVisible: true  },

  // ── Non-default columns (visible via column picker) ──────────────────────
  { key: 'date',         label: 'Order Date',       width: 90,  sortable: true,  defaultVisible: false },
  { key: 'custcarrier',  label: 'Shipping Account', width: 140, sortable: true,  defaultVisible: false },
  { key: 'total',        label: 'Order Total',      width: 85,  sortable: true,  defaultVisible: false },
  { key: 'bestrate',     label: 'Best Rate',        width: 80,  sortable: false, defaultVisible: false },
  { key: 'margin',       label: 'Ship Margin',      width: 90,  sortable: false, defaultVisible: false },
  { key: 'tracking',     label: 'Tracking #',       width: 160, sortable: false, defaultVisible: false },
  { key: 'labelcreated', label: 'Label Created',    width: 115, sortable: false, defaultVisible: false },
];
