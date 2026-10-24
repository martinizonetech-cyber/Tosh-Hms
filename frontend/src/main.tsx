import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { DemoProvider } from './services/mock/DemoProvider';
import { ToastProvider } from './components/ui/Toast';
import { AuthProvider, RouteGuard } from './services/auth/AuthContext';
import { App } from './app/App';
import './styles/index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <AuthProvider>
        <ToastProvider>
          <DemoProvider>
            <RouteGuard>
              <App />
            </RouteGuard>
          </DemoProvider>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
