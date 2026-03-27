import styles from './RightPanel.module.scss';

export default function EmptyPanel() {
  return (
    <div className={styles.emptyState}>
      <div className={styles.emptyIcon}>📋</div>
      <div className={styles.emptyTitle}>No orders selected</div>
      <div className={styles.emptySubtitle}>Click any row to view details</div>
    </div>
  );
}
