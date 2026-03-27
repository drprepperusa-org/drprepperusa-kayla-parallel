import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import Layout from './components/Layout/Layout';
import OrdersView from './components/OrdersView/OrdersView';
import OrderDetail from './components/OrderDetail';
import PlaceholderPage from './pages/PlaceholderPage';
import BillingSection from './components/Billing/BillingSection';
import SettingsPage from './pages/SettingsPage';
import { useUIStore } from './stores/uiStore';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,   // 5 min default stale time
      gcTime: 10 * 60 * 1000,     // 10 min garbage collection
      retry: 2,
      refetchOnWindowFocus: false, // PrepShip is a work tool — no surprise refetches
    },
    mutations: {
      retry: 0,
    },
  },
});

function AppInner() {
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

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppInner />
      {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  );
}
