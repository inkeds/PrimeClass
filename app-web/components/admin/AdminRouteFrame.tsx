'use client';

import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import { useAdminContext } from '@/components/admin/AdminContext';
import { canAccessAdminPath, getFirstAccessibleAdminPath } from '@/components/admin/lib/permissions';
import { AdminShell } from '@/components/admin/AdminShell';

export function AdminRouteFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { bootstrapping, logout, session } = useAdminContext();
  const isLoginPage = pathname === '/admin/login';

  useEffect(() => {
    if (bootstrapping) {
      return;
    }

    if (!session && !isLoginPage) {
      router.replace('/admin/login');
      return;
    }

    if (session && isLoginPage) {
      router.replace(getFirstAccessibleAdminPath(session.permissions));
      return;
    }

    if (session && !isLoginPage && !canAccessAdminPath(pathname, session.permissions)) {
      router.replace(getFirstAccessibleAdminPath(session.permissions));
    }
  }, [bootstrapping, isLoginPage, pathname, router, session]);

  if (bootstrapping) {
    return <div className="screen-center">正在连接后台服务…</div>;
  }

  if (!session && !isLoginPage) {
    return <div className="screen-center">正在跳转登录页…</div>;
  }

  if (session && isLoginPage) {
    return <div className="screen-center">已登录，正在进入后台…</div>;
  }

  if (session && !isLoginPage && !canAccessAdminPath(pathname, session.permissions)) {
    return <div className="screen-center">当前账号无权访问该页面，正在跳转…</div>;
  }

  if (isLoginPage) {
    return <>{children}</>;
  }

  return (
    <AdminShell
      session={session!}
      onLogout={() => {
        logout();
        router.push('/admin/login');
      }}
    >
      {children}
    </AdminShell>
  );
}
