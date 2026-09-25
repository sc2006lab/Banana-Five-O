import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { Layout } from './components/Layout';
import { Spinner } from './components/ui';
import { AppStateProvider, useApp } from './state/AppState';
import { ExplorePage } from './pages/Explore';
import { ProfilePage } from './pages/Profile';
import { CommutePage } from './pages/Commute';
import { ComparePage } from './pages/Compare';
import { ShortlistPage } from './pages/Shortlist';
import { PreferencesPage } from './pages/Preferences';
import { SignInPage } from './pages/SignIn';
import { ForgotPasswordPage, ResetPasswordPage } from './pages/PasswordReset';
import { AccountPage } from './pages/Account';
import { AdminPage } from './pages/Admin';

function RequireAuth({ children, admin = false }: { children: ReactNode; admin?: boolean }) {
  const { me, loadingMe } = useApp();
  const loc = useLocation();
  if (loadingMe) return <Spinner />;
  if (!me) return <Navigate to={`/signin?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  if (admin && me.role !== 'DATA_ADMINISTRATOR')
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-burgundy">Administrator access only</h1>
        <p className="mt-2 text-muted">Data-source monitoring is limited to data administrators.</p>
        <Link to="/" className="btn-primary mt-6">
          Back to Explore
        </Link>
      </div>
    );
  return <>{children}</>;
}

export function App() {
  return (
    <AppStateProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<ExplorePage />} />
            <Route path="n/:id" element={<ProfilePage />} />
            <Route path="n/:id/commute" element={<CommutePage />} />
            <Route path="compare" element={<ComparePage />} />
            <Route path="shortlist" element={<ShortlistPage />} />
            <Route path="preferences" element={<PreferencesPage />} />
            <Route path="signin" element={<SignInPage />} />
            <Route path="register" element={<SignInPage initialTab="register" />} />
            <Route path="forgot-password" element={<ForgotPasswordPage />} />
            <Route path="reset-password" element={<ResetPasswordPage />} />
            <Route
              path="account"
              element={
                <RequireAuth>
                  <AccountPage />
                </RequireAuth>
              }
            />
            <Route
              path="admin"
              element={
                <RequireAuth admin>
                  <AdminPage />
                </RequireAuth>
              }
            />
            <Route
              path="*"
              element={
                <div className="mx-auto max-w-xl px-4 py-16 text-center">
                  <h1 className="text-2xl font-bold text-burgundy">Page not found</h1>
                  <Link to="/" className="btn-primary mt-6">
                    Back to Explore
                  </Link>
                </div>
              }
            />
          </Route>
        </Routes>
      </BrowserRouter>
    </AppStateProvider>
  );
}
