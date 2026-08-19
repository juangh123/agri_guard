import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import axios from 'axios';
import { Loader2 } from 'lucide-react';

// Lazy load route pages for performance & code-splitting
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Register = lazy(() => import('./pages/Register'));
const Login = lazy(() => import('./pages/Login'));

// Configure axios interceptor for JWT
axios.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

// On 401 responses (expired/invalid token) clear stored credentials and go to /login
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('token'); // legacy key cleanup
      localStorage.removeItem('userName');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

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
  return (
    <Router>
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
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/dashboard" element={<Navigate to="/" replace />} />
          <Route path="/register" element={<Register />} />
          <Route path="/login" element={<Login />} />
          {/* Catch-all route to prevent blank page on unknown URL */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </Router>
  );
}

export default App;
