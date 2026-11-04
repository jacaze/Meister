import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext.js';
import AppLayout from './components/layout/AppLayout.js';
import AuthPage from './pages/AuthPage.js';
import DashboardPage from './pages/DashboardPage.js';
import TransactionsPage from './pages/TransactionsPage.js';
import JarsPage from './pages/JarsPage.js';
import DasPage from './pages/DasPage.js';
import ReportsPage from './pages/ReportsPage.js';
import ProfilePage from './pages/ProfilePage.js';
import InsightsPage from './pages/InsightsPage.js';
import ReviewInboxPage from './pages/ReviewInboxPage.js';

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { token, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#131313] text-[#e5e2e1] flex flex-col items-center justify-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#f2c94c] to-[#ffe8ad] flex items-center justify-center text-[#131313] font-black text-2xl shadow-[0_0_25px_rgba(242,201,76,0.4)] animate-pulse">
          M
        </div>
        <p className="text-xs font-bold text-[#99907b] tracking-widest uppercase">
          Carregando MEIster...
        </p>
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
    <BrowserRouter>
      <AuthProvider>
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
            <Route path="insights" element={<InsightsPage />} />
            <Route path="revisao" element={<ReviewInboxPage />} />
            <Route path="impostos" element={<DasPage />} />
            <Route path="relatorios" element={<ReportsPage />} />
            <Route path="perfil" element={<ProfilePage />} />
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
};

export default App;
