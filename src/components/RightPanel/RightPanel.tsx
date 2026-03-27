import { useOrdersStore } from '../../stores/ordersStore';
import EmptyPanel from './EmptyPanel';
import SingleOrderPanel from './SingleOrderPanel';
import BatchPanel from './BatchPanel';
import styles from './RightPanel.module.scss';

export default function RightPanel() {
  const { orders, selectedOrderIds, toggleOrderSelection, clearSelection } = useOrdersStore();
  const selectedOrders = orders.filter((o) => selectedOrderIds.has(o.orderId));

  const handleRemove = (orderId: number) => toggleOrderSelection(orderId);
  const handleClearAll = () => clearSelection();

  return (
    <div className={styles.rightPanel}>
      {selectedOrders.length === 0 && <EmptyPanel />}
      {selectedOrders.length === 1 && <SingleOrderPanel order={selectedOrders[0]} />}
      {selectedOrders.length >= 2 && (
        <BatchPanel
          orders={selectedOrders}
          onRemove={handleRemove}
          onClearAll={handleClearAll}
        />
      )}
    </div>
  );
}
