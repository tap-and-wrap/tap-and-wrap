import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App.jsx';
import { SessionProvider } from './auth/SessionProvider.jsx';
import PageErrorBoundary from './components/PageErrorBoundary.jsx';
import { initializePrerender } from './seo/boot.js';
import './styles.css';
import './design-system.css';
import './catalog.css';
import './admin.css';
import './commerce/commerce.css';
import './website.css';
import './storefront.css';
import './accessibility.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 60_000, retry: 1, refetchOnWindowFocus: false },
  },
});

const root = document.getElementById('root');
initializePrerender(root);
createRoot(root).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <PageErrorBoundary><SessionProvider><BrowserRouter><App /></BrowserRouter></SessionProvider></PageErrorBoundary>
    </QueryClientProvider>
  </React.StrictMode>,
);
