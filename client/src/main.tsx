import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { ConfigProvider } from './config';
import { CartProvider } from './cart';
import ErrorBoundary from './components/ErrorBoundary';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ConfigProvider>
          <CartProvider>
            <App />
          </CartProvider>
        </ConfigProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
);
