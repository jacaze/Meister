import React, { lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext.js';
import ToastProvider from './components/ui/Toast.js';
import ErrorBoundary from './components/common/ErrorBoundary.js';
import AppLayout from './components/layout/AppLayout.js';
import Mel from './components/brand/Mel.js';
import AuthPage from './pages/AuthPage.js';
import DashboardPage from './pages/DashboardPage.js';
// Telas secundárias carregadas sob demanda: o pacote inicial leva só login e painel.
const TransactionsPage = lazy(() => import('./pages/TransactionsPage.js'));
const JarsPage = lazy(() => import('./pages/JarsPage.js'));
const DasPage = lazy(() => import('./pages/DasPage.js'));
const ReportsPage = lazy(() => import('./pages/ReportsPage.js'));
const ProfilePage = lazy(() => import('./pages/ProfilePage.js'));
const ReviewInboxPage = lazy(() => import('./pages/ReviewInboxPage.js'));
const EducationPage = lazy(() => import('./pages/EducationPage.js'));

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { token, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center gap-3 bg-canvas" aria-busy="true">
        <Mel size={96} mood="idle" />
        <p className="text-sm font-bold text-muted">Abrindo o favo…</p>
      </div>
    );
  }

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

const PublicRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { token, loading } = useAuth();

  if (loading) {
    return null;
  }

  if (token) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

export const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <ToastProvider>
            <Routes>
            {/* Public Auth Route */}
            <Route
              path="/login"
              element={
                <PublicRoute>
                  <AuthPage />
                </PublicRoute>
              }
            />

            {/* Protected Application Routes */}
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<DashboardPage />} />
              <Route path="transacoes" element={<TransactionsPage />} />
              <Route path="potes" element={<JarsPage />} />
              <Route path="insights" element={<Navigate to="/" replace />} />
              <Route path="revisao" element={<ReviewInboxPage />} />
              <Route path="extratos" element={<ReviewInboxPage />} />
              <Route path="openfinance" element={<ReviewInboxPage />} />
              <Route path="open-finance" element={<ReviewInboxPage />} />
              <Route path="educacao" element={<EducationPage />} />
              <Route path="impostos" element={<DasPage />} />
              <Route path="relatorios" element={<ReportsPage />} />
              <Route path="perfil" element={<ProfilePage />} />
            </Route>

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
};

export default App;
