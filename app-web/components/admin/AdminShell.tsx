'use client';

import type { ReactNode, SVGProps } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { hasAdminPermission } from '@/components/admin/lib/permissions';
import type { AdminSession } from '@/components/admin/lib/session';

type AdminShellProps = {
  session: AdminSession;
  onLogout: () => void;
  children: ReactNode;
};

type NavIconName = 'overview' | 'users' | 'courses' | 'dimension' | 'membership' | 'dictionary' | 'settings' | 'notice';

type NavItem = {
  href: string;
  label: string;
  icon: NavIconName;
  exact?: boolean;
  requiredPermissions: string[];
};

const navItems: NavItem[] = [
  { href: '/admin', label: '工作台', exact: true, icon: 'overview', requiredPermissions: ['dashboard.view'] },
  { href: '/admin/courses', label: '课程管理', icon: 'courses', requiredPermissions: ['courses.view'] },
  { href: '/admin/content-dimensions', label: '内容维度', icon: 'dimension', requiredPermissions: ['courses.view'] },
  { href: '/admin/users', label: '学员列表', icon: 'users', requiredPermissions: ['users.view'] },
  { href: '/admin/membership', label: '会员管理', icon: 'membership', requiredPermissions: ['membership.view'] },
  { href: '/admin/dictionaries', label: '通用字典', icon: 'dictionary', requiredPermissions: ['system.view'] },
  { href: '/admin/notifications', label: '通知发布', icon: 'notice', requiredPermissions: ['system.view'] },
  { href: '/admin/settings', label: '系统管理', icon: 'settings', requiredPermissions: ['system.view'] },
];

function isActivePath(pathname: string, item: NavItem) {
  return item.exact ? pathname === item.href : pathname.startsWith(item.href);
}

function NavGlyph({ name, ...props }: { name: NavIconName } & SVGProps<SVGSVGElement>) {
  switch (name) {
    case 'overview':
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24" {...props}>
          <path d="M4 11.5 12 5l8 6.5" />
          <path d="M7 10.5V19h10v-8.5" />
        </svg>
      );
    case 'users':
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24" {...props}>
          <path d="M15.5 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
          <path d="M4.5 11.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
          <path d="M10.5 20c0-2.8 2.2-5 5-5s5 2.2 5 5" />
          <path d="M2 20c0-2 1.6-3.5 3.5-3.5 1.1 0 2.1.4 2.8 1.2" />
        </svg>
      );
    case 'courses':
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24" {...props}>
          <path d="M5 5h14v14H5z" />
          <path d="M9 5v14" />
          <path d="M12.5 9h4" />
          <path d="M12.5 13h4" />
        </svg>
      );
    case 'dimension':
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24" {...props}>
          <path d="M12 4 5 8l7 4 7-4-7-4Z" />
          <path d="m5 12 7 4 7-4" />
          <path d="m5 16 7 4 7-4" />
        </svg>
      );
    case 'membership':
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24" {...props}>
          <path d="m4 8 4.2 3.2L12 5l3.8 6.2L20 8l-2 11H6L4 8Z" />
          <path d="M9 15h6" />
        </svg>
      );
    case 'dictionary':
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24" {...props}>
          <path d="M6 5h12v14H6z" />
          <path d="M9 9h6" />
          <path d="M9 12.5h6" />
          <path d="M9 16h4" />
        </svg>
      );
    case 'settings':
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24" {...props}>
          <path d="M12 8.2a3.8 3.8 0 1 1 0 7.6 3.8 3.8 0 0 1 0-7.6Z" />
          <path d="M19 12a7.1 7.1 0 0 0-.1-1.1l2-1.5-2-3.4-2.4 1a8 8 0 0 0-1.9-1.1l-.4-2.5h-4l-.4 2.5c-.7.2-1.3.6-1.9 1.1l-2.4-1-2 3.4 2 1.5A7.1 7.1 0 0 0 5 12c0 .4 0 .8.1 1.1l-2 1.5 2 3.4 2.4-1c.6.5 1.2.9 1.9 1.1l.4 2.5h4l.4-2.5c.7-.2 1.3-.6 1.9-1.1l2.4 1 2-3.4-2-1.5c.1-.3.1-.7.1-1.1Z" />
        </svg>
      );
    case 'notice':
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24" {...props}>
          <path d="M12 4.5a5 5 0 0 0-5 5v2.2c0 .8-.2 1.5-.6 2.2L5 16.5h14l-1.4-2.6c-.4-.7-.6-1.4-.6-2.2V9.5a5 5 0 0 0-5-5Z" />
          <path d="M10 18.5a2 2 0 0 0 4 0" />
        </svg>
      );
  }
}

export function AdminShell({ session, onLogout, children }: AdminShellProps) {
  const pathname = usePathname();
  const visibleNavItems = navItems.filter((item) => hasAdminPermission(session.permissions, item.requiredPermissions));
  const activeItem = visibleNavItems.find((item) => isActivePath(pathname, item)) ?? visibleNavItems[0] ?? navItems[0];
  const displayName = session.adminInfo.real_name || session.adminInfo.username;
  const avatarText = session.adminInfo.username.slice(0, 1).toUpperCase();

  return (
    <div className="shell">
      <aside className="shell-sidebar">
        <div className="brand-panel">
          <div className="brand-mark">Y</div>
          <div className="brand-copy">
            <div className="brand-title">优学课堂</div>
          </div>
        </div>

        <nav className="sidebar-nav sidebar-nav-flat">
          {visibleNavItems.map((item) => {
            const active = isActivePath(pathname, item);

            return (
              <Link key={item.href} href={item.href} className={`nav-item${active ? ' is-active' : ''}`}>
                <span className="nav-icon" aria-hidden="true">
                  <NavGlyph name={item.icon} />
                </span>
                <span className="nav-label">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <section className="sidebar-note">
            <div className="sidebar-note-head">
              <span className="sidebar-note-dot" aria-hidden="true" />
              <strong>系统活跃提示</strong>
            </div>
            <p>当前时段建议优先检查课程上架、会员激活码批次与用户异常状态。</p>
          </section>

          <button className="sidebar-logout" onClick={onLogout} type="button">
            退出登录
          </button>
        </div>
      </aside>

      <div className="shell-main">
        <header className="topbar">
          <div className="topbar-title">{activeItem.label}</div>

          <div className="topbar-actions">
            <button aria-label="通知" className="topbar-action topbar-action-bell" type="button" />
            <div className="topbar-user">
              <div className="topbar-user-copy">
                <div className="topbar-name">{displayName}</div>
                <div className="topbar-meta">超级管理员</div>
              </div>
              <div className="avatar-badge avatar-badge-small">{avatarText}</div>
            </div>
          </div>
        </header>

        <main className="content">{children}</main>
      </div>
    </div>
  );
}
