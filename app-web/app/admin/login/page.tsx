'use client';

import { useRouter } from 'next/navigation';

import { useAdminContext } from '@/components/admin/AdminContext';
import { LoginPage } from '@/components/admin/pages/LoginPage';

export default function AdminLoginRoute() {
  const router = useRouter();
  const { login } = useAdminContext();

  return (
    <LoginPage
      onLogin={async (username, password) => {
        await login(username, password);
        router.push('/admin');
      }}
    />
  );
}
