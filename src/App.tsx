import Layout from './components/Layout/Layout';
import OrdersView from './components/OrdersView/OrdersView';
import OrderDetail from './components/OrderDetail';
import PlaceholderPage from './pages/PlaceholderPage';
import BillingSection from './components/Billing/BillingSection';
import SettingsPage from './pages/SettingsPage';
import { useUIStore } from './stores/uiStore';

export default function App() {
  const currentView = useUIStore((s) => s.currentView);

  const renderView = () => {
    switch (currentView) {
      case 'orders':
        return <OrdersView />;
      case 'inventory':
        return <PlaceholderPage title="Inventory" />;
      case 'locations':
        return <PlaceholderPage title="Locations" />;
      case 'packages':
        return <PlaceholderPage title="Packages" />;
      case 'rates':
        return <PlaceholderPage title="Rate Shop" />;
      case 'analysis':
        return <PlaceholderPage title="Analysis" />;
      case 'settings':
        return <SettingsPage />;
      case 'billing':
        return <BillingSection />;
      case 'manifests':
        return <PlaceholderPage title="Manifests" />;
      default:
        return <OrdersView />;
    }
  };

  return (
    <Layout>
      {renderView()}
      <OrderDetail />
    </Layout>
  );
}
