import type { ReactNode } from 'react';

import { AdminProvider } from '@/components/admin/AdminContext';
import { AdminRouteFrame } from '@/components/admin/AdminRouteFrame';
import './admin.css';

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="admin-layout-root">
      <AdminProvider>
        <AdminRouteFrame>{children}</AdminRouteFrame>
      </AdminProvider>
    </div>
  );
}
