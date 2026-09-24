import React, { Suspense, lazy, useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import { Loader2 } from 'lucide-react';

import { ensureDemoSession, hasStoredSession } from './utils/auth';
import { useLocation } from './utils/router';
import { Redirect } from './utils/router.jsx';

// Lazy load route pages for performance & code-splitting
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Register = lazy(() => import('./pages/Register'));
const Login = lazy(() => import('./pages/Login'));

// Fallback spinner while lazily loading pages
const PageLoader = () => (
  <div className="min-h-screen w-full flex flex-col items-center justify-center bg-background">
    <div className="flex flex-col items-center gap-3 card-surface p-8 shadow-xl">
      <Loader2 className="h-10 w-10 text-primary animate-spin" />
      <span className="text-sm font-semibold text-muted-foreground">Loading AgriGuard...</span>
    </div>
  </div>
);

function App() {
  // Silent demo login: hackathon judges shouldn't need credentials to trigger
  // the full disaster pipeline (simulate endpoint requires auth). Read-only
  // data still loads if this fails (offline / backend down).
  useEffect(() => {
    if (hasStoredSession()) return;
    // Offline demo mode is non-fatal: ensureDemoSession resolves to null.
    ensureDemoSession();
  }, []);

  return (
    <>
      <Toaster 
        position="top-center" 
        toastOptions={{ 
          style: {
            background: 'hsl(var(--popover))',
            color: 'hsl(var(--popover-foreground))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '12px',
            fontSize: '13px',
            fontWeight: 600,
            boxShadow: '0 10px 25px -5px rgb(0 0 0 / 0.15)',
          },
          success: { iconTheme: { primary: 'hsl(var(--primary))', secondary: 'hsl(var(--primary-foreground))' } },
          error: { iconTheme: { primary: 'hsl(var(--destructive))', secondary: 'hsl(var(--destructive-foreground))' } }
        }} 
      />
      <AppRoutes />
    </>
  );
}

function AppRoutes() {
  const { pathname } = useLocation();

  if (pathname === '/dashboard' || !['/', '/login', '/register'].includes(pathname)) {
    return <Redirect to="/" replace />;
  }

  return (
    <Suspense fallback={<PageLoader />}>
      {pathname === '/login' && <Login />}
      {pathname === '/register' && <Register />}
      {pathname === '/' && <Dashboard />}
    </Suspense>
  );
}

export default App;
