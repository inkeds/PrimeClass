'use client';

import type { ReactNode } from 'react';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { apiRequest } from '@/components/admin/lib/api';
import {
  clearAdminSession,
  readAdminSession,
  writeAdminSession,
  type AdminSession,
} from '@/components/admin/lib/session';

type AdminContextValue = {
  session: AdminSession | null;
  bootstrapping: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
};

const AdminContext = createContext<AdminContextValue | null>(null);

export function AdminProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [bootstrapping, setBootstrapping] = useState(true);

  useEffect(() => {
    const stored = readAdminSession();
    setSession(stored);

    if (!stored) {
      setBootstrapping(false);
      return;
    }

    const initialSession = stored;

    let cancelled = false;

    async function bootstrap() {
      try {
        const profile = await apiRequest<{
          admin_info: { username: string; real_name: string };
          permissions: string[];
        }>('/auth/me');

        if (cancelled) {
          return;
        }

        const nextSession: AdminSession = {
          ...initialSession,
          adminInfo: profile.admin_info,
          permissions: profile.permissions,
        };

        writeAdminSession(nextSession);
        setSession(nextSession);
      } catch {
        if (!cancelled) {
          clearAdminSession();
          setSession(null);
        }
      } finally {
        if (!cancelled) {
          setBootstrapping(false);
        }
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<AdminContextValue>(
    () => ({
      session,
      bootstrapping,
      login: async (username: string, password: string) => {
        const data = await apiRequest<{
          token: string;
          admin_info: { username: string; real_name: string };
          permissions: string[];
        }>('/auth/login', {
          method: 'POST',
          body: {
            username,
            password,
          },
        });

        const nextSession: AdminSession = {
          token: data.token,
          adminInfo: data.admin_info,
          permissions: data.permissions,
        };

        writeAdminSession(nextSession);
        setSession(nextSession);
      },
      logout: () => {
        const token = session?.token ?? readAdminSession()?.token;

        if (token) {
          void apiRequest<{ success: boolean }>('/auth/logout', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }).catch(() => undefined);
        }

        clearAdminSession();
        setSession(null);
      },
    }),
    [bootstrapping, session],
  );

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}

export function useAdminContext() {
  const context = useContext(AdminContext);

  if (!context) {
    throw new Error('useAdminContext must be used within AdminProvider');
  }

  return context;
}
