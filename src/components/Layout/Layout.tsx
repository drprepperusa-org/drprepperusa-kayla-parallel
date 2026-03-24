import Sidebar from '../Sidebar/Sidebar';
import { useUIStore } from '../../stores/uiStore';
import styles from './Layout.module.scss';

const VIEW_TITLES: Record<string, string> = {
  orders: 'Orders',
  inventory: 'Inventory',
  locations: 'Locations',
  packages: 'Packages',
  rates: 'Rate Shop',
  analysis: 'Analysis',
  settings: 'Settings',
  billing: 'Billing',
  manifests: 'Manifests',
};

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const { currentView, setSidebarOpen } = useUIStore();

  return (
    <div className={styles.layout}>
      <Sidebar />
      <div className={styles.main}>
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <button
              className={styles.menuBtn}
              onClick={() => setSidebarOpen(true)}
            >
              ☰
            </button>
            <h1 className={styles.viewTitle}>{VIEW_TITLES[currentView] || 'Orders'}</h1>
          </div>
        </div>
        <div className={styles.content}>
          {children}
        </div>
      </div>
    </div>
  );
}
