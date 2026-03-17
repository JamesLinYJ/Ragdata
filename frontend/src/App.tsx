import { LoaderCircle } from 'lucide-react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppShell } from './components/app-shell';
import { PageErrorBoundary } from './components/page-error-boundary';
import { AuthProvider, useAuth } from './context/auth-context';
import { DashboardPage } from './pages/dashboard-page';
import { ChatPage } from './pages/chat-page';
import { KnowledgePage } from './pages/knowledge-page';
import { LoginPage } from './pages/login-page';
import { SettingsPage } from './pages/settings-page';

function ProtectedRoutes() {
  const { session } = useAuth();
  const location = useLocation();

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/knowledge" element={<KnowledgePage />} />
        <Route path="/chat" element={<ChatPage />} />
        <Route
          path="/settings"
          element={
            <PageErrorBoundary title="系统配置加载失败">
              <SettingsPage />
            </PageErrorBoundary>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function BootScreen() {
  return (
    <div className="boot-screen page-enter">
      <section className="login-card silent-card boot-panel">
        <div className="boot-stack">
          <div className="brand-mark boot-brand">KN</div>
          <div className="auth-header">
            <span className="page-eyebrow">正在进入</span>
            <h2>Know 工作空间</h2>
            <p className="page-lead">正在准备环境与数据，请稍候片刻。</p>
          </div>
          <LoaderCircle className="spin accent-icon" size={28} />
        </div>
      </section>
    </div>
  );
}

function AppRoutes() {
  const { session, ready } = useAuth();
  const location = useLocation();
  const redirectTo =
    (location.state as { from?: { pathname?: string } } | null)?.from?.pathname || '/';

  if (!ready) {
    return <BootScreen />;
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={session ? <Navigate to={redirectTo} replace /> : <LoginPage />}
      />
      <Route path="/*" element={<ProtectedRoutes />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
