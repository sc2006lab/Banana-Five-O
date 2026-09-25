import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { lazy, Suspense, type ReactNode } from 'react';
import { Layout } from './components/Layout';
import { Spinner } from './components/ui';
import { AppStateProvider, useApp } from './state/AppState';
import { LandingPage } from './pages/Landing';

const ExplorePage = lazy(() => import('./pages/Explore').then((m) => ({ default: m.ExplorePage })));
const ProfilePage = lazy(() => import('./pages/Profile').then((m) => ({ default: m.ProfilePage })));
const CommutePage = lazy(() => import('./pages/Commute').then((m) => ({ default: m.CommutePage })));
const ComparePage = lazy(() => import('./pages/Compare').then((m) => ({ default: m.ComparePage })));
const ShortlistPage = lazy(() => import('./pages/Shortlist').then((m) => ({ default: m.ShortlistPage })));
const PreferencesPage = lazy(() => import('./pages/Preferences').then((m) => ({ default: m.PreferencesPage })));
const SignInPage = lazy(() => import('./pages/SignIn').then((m) => ({ default: m.SignInPage })));
const AccountPage = lazy(() => import('./pages/Account').then((m) => ({ default: m.AccountPage })));
const AdminPage = lazy(() => import('./pages/Admin').then((m) => ({ default: m.AdminPage })));
const WorkspaceSettingsPage = lazy(() => import('./pages/WorkspaceSettings').then((m) => ({ default: m.WorkspaceSettingsPage })));
const BillingPage = lazy(() => import('./pages/Billing').then((m) => ({ default: m.BillingPage })));
const InvitePage = lazy(() => import('./pages/Invite').then((m) => ({ default: m.InvitePage })));
const PricingPage = lazy(() => import('./pages/Pricing').then((m) => ({ default: m.PricingPage })));
const ForgotPasswordPage = lazy(() => import('./pages/PasswordReset').then((m) => ({ default: m.ForgotPasswordPage })));
const ResetPasswordPage = lazy(() => import('./pages/PasswordReset').then((m) => ({ default: m.ResetPasswordPage })));


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
        <Link to="/explore" className="btn-primary mt-6">
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
        <Suspense fallback={<Spinner />}>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<LandingPage />} />
            <Route path="explore" element={<ExplorePage />} />
            <Route path="pricing" element={<PricingPage />} />
            <Route path="n/:id" element={<ProfilePage />} />
            <Route path="n/:id/commute" element={<CommutePage />} />
            <Route path="compare" element={<ComparePage />} />
            <Route path="shortlist" element={<ShortlistPage />} />
            <Route path="preferences" element={<PreferencesPage />} />
            <Route path="signin" element={<SignInPage />} />
            <Route path="register" element={<SignInPage initialTab="register" />} />
            <Route path="forgot-password" element={<ForgotPasswordPage />} />
            <Route path="reset-password" element={<ResetPasswordPage />} />
            <Route path="invite" element={<InvitePage />} />
            <Route
              path="settings/workspace"
              element={
                <RequireAuth>
                  <WorkspaceSettingsPage />
                </RequireAuth>
              }
            />
            <Route
              path="settings/billing"
              element={
                <RequireAuth>
                  <BillingPage />
                </RequireAuth>
              }
            />
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
                  <Link to="/explore" className="btn-primary mt-6">
                    Back to Explore
                  </Link>
                </div>
              }
            />
          </Route>
        </Routes>
        </Suspense>
      </BrowserRouter>
    </AppStateProvider>
  );
}
