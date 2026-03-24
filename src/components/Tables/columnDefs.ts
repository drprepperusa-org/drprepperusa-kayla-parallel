import type { ColumnDef } from '../../types/orders';

export const ALL_COLUMNS: ColumnDef[] = [
  { key: 'select',       label: '',                 width: 34,  sortable: false, defaultVisible: true },
  { key: 'date',         label: 'Order Date',       width: 90,  sortable: true,  defaultVisible: true },
  { key: 'client',       label: 'Client',           width: 100, sortable: true,  defaultVisible: true },
  { key: 'orderNum',     label: 'Order #',          width: 85,  sortable: true,  defaultVisible: true },
  { key: 'customer',     label: 'Recipient',        width: 175, sortable: true,  defaultVisible: true },
  { key: 'itemname',     label: 'Item Name',        width: 170, sortable: true,  defaultVisible: true },
  { key: 'sku',          label: 'SKU',              width: 100, sortable: true,  defaultVisible: true },
  { key: 'qty',          label: 'Qty',              width: 40,  sortable: true,  defaultVisible: true },
  { key: 'weight',       label: 'Weight',           width: 80,  sortable: true,  defaultVisible: true },
  { key: 'shipto',       label: 'Ship To',          width: 135, sortable: true,  defaultVisible: true },
  { key: 'carrier',      label: 'Carrier',          width: 145, sortable: true,  defaultVisible: true },
  { key: 'custcarrier',  label: 'Shipping Account', width: 140, sortable: true,  defaultVisible: true },
  { key: 'total',        label: 'Order Total',      width: 85,  sortable: true,  defaultVisible: true },
  { key: 'bestrate',     label: 'Best Rate',        width: 80,  sortable: false, defaultVisible: true },
  { key: 'margin',       label: 'Ship Margin',      width: 90,  sortable: false, defaultVisible: true },
  { key: 'tracking',     label: 'Tracking #',       width: 160, sortable: false, defaultVisible: true },
  { key: 'labelcreated', label: 'Label Created',    width: 115, sortable: false, defaultVisible: true },
  { key: 'age',          label: 'Age',              width: 50,  sortable: true,  defaultVisible: true },
];
