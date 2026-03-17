import { ArrowRight, LoaderCircle, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/auth-context';

const AUTO_LOGIN_EMAIL = import.meta.env.VITE_AUTO_LOGIN_EMAIL || '';
const AUTO_LOGIN_PASSWORD = import.meta.env.VITE_AUTO_LOGIN_PASSWORD || '';
const HAS_AUTO_ENTRY = Boolean(AUTO_LOGIN_EMAIL && AUTO_LOGIN_PASSWORD);

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const redirectTo =
    (location.state as { from?: { pathname?: string } } | null)?.from?.pathname || '/';

  async function handleRetry() {
    if (!HAS_AUTO_ENTRY) {
      setError('当前无法进入页面');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await login(AUTO_LOGIN_EMAIL, AUTO_LOGIN_PASSWORD);
      navigate(redirectTo, { replace: true });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '进入系统失败');
      setLoading(false);
    }
  }

  return (
    <div className="auth-screen page-enter">
      <section className="login-card silent-card auth-card">
        <div className="auth-stack">
          <div className="brand-mark boot-brand">KN</div>
          <div className="auth-header">
            <span className="page-eyebrow">安全进入</span>
            <h1>Know 工作空间</h1>
            <p className="page-lead">即将进入当前知识空间，系统会自动完成连接检查。</p>
          </div>

          <div className="auth-callout">
            <ShieldCheck size={26} className="accent-icon" />
            <div>
              <h2>身份验证</h2>
              <p>{HAS_AUTO_ENTRY ? '已通过自动授权，准备进入。' : '当前无法自动完成载入。'}</p>
            </div>
          </div>

          {error ? <div className="feedback feedback-error">{error}</div> : null}

          <button
            className="primary-button full-width button-large"
            type="button"
            disabled={loading}
            onClick={handleRetry}
          >
            {loading ? <LoaderCircle className="spin" size={16} /> : <ArrowRight size={16} />}
            <span>{loading ? '载入中...' : '重新载入'}</span>
          </button>
        </div>
      </section>
    </div>
  );
}
