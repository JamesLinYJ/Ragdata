import { Database, House, MessageSquareText, Settings, ShieldCheck } from 'lucide-react';
import { NavLink, Outlet } from 'react-router-dom';

const navItems = [
  {
    to: '/',
    label: '首页',
    icon: House,
  },
  {
    to: '/knowledge',
    label: '知识库',
    icon: Database,
  },
  {
    to: '/chat',
    label: '聊天',
    icon: MessageSquareText,
  },
  {
    to: '/settings',
    label: '配置',
    icon: Settings,
  },
];

export function AppShell() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-card">
          <div className="brand-mark">KN</div>
          <div>
            <div className="brand-title">Know</div>
            <div className="brand-subtitle">知识检索系统</div>
          </div>
        </div>

        <nav className="nav-list">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                isActive ? 'nav-link nav-link-active' : 'nav-link'
              }
            >
              <Icon size={18} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user-card system-card">
            <div className="system-card-title">
              <ShieldCheck size={16} />
              <span>服务可用</span>
            </div>
            <div className="user-email">当前空间运行稳定</div>
          </div>
        </div>
      </aside>

      <main className="main-panel">
        <Outlet />
      </main>
    </div>
  );
}
