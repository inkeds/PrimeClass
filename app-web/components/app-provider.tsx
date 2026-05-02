'use client';

import type { ReactNode } from 'react';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import { getMembership, isUnauthorizedError, redeemMembership } from '@/lib/api';
import { clearSession, readSession, writeSession } from '@/lib/session';
import type { AppSession, MembershipSnapshot } from '@/lib/types';
import { buildRedirect, formatDateLabel, hasVipMembership, isPermanentMembership } from '@/lib/utils';
import { CrownIcon, GiftIcon } from '@/components/icons';

type ToastState = {
  id: number;
  message: string;
  tone: 'success' | 'error';
};

type AppContextValue = {
  mounted: boolean;
  session: AppSession | null;
  setSession: (session: AppSession | null) => void;
  logout: () => void;
  refreshMembership: () => Promise<void>;
  showToast: (message: string, tone?: 'success' | 'error') => void;
  openRedeem: () => void;
  closeRedeem: () => void;
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [session, setSessionState] = useState<AppSession | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [redeemOpen, setRedeemOpen] = useState(false);
  const [redeemCode, setRedeemCode] = useState('');
  const [redeemPending, setRedeemPending] = useState(false);
  const toastTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const storedSession = readSession();
    setSessionState(storedSession);
    setMounted(true);
  }, []);

  useEffect(() => {
    const token = session?.token ?? null;

    if (!token) {
      return;
    }

    const resolvedToken = token;
    let active = true;

    async function syncMembership() {
      try {
        const membership = await getMembership(resolvedToken);

        if (!active) {
          return;
        }

        setSessionState((current) => {
          if (!current || current.token !== resolvedToken) {
            return current;
          }

          const nextSession = mergeSessionMembership(current, membership);
          writeSession(nextSession);
          return nextSession;
        });
      } catch (error) {
        if (active && isUnauthorizedError(error)) {
          logout();
        }
      }
    }

    void syncMembership();

    return () => {
      active = false;
    };
  }, [session?.token]);

  useEffect(
    () => () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
    },
    [],
  );

  function setSession(sessionValue: AppSession | null) {
    setSessionState(sessionValue);

    if (sessionValue) {
      writeSession(sessionValue);
      return;
    }

    clearSession();
  }

  function showToast(message: string, tone: 'success' | 'error' = 'success') {
    const nextToast = {
      id: Date.now(),
      message,
      tone,
    } satisfies ToastState;

    setToast(nextToast);

    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }

    toastTimerRef.current = window.setTimeout(() => {
      setToast((current) => (current?.id === nextToast.id ? null : current));
    }, 2600);
  }

  function logout() {
    setRedeemOpen(false);
    setSession(null);
  }

  async function refreshMembership() {
    if (!session?.token) {
      return;
    }

    const membership = await getMembership(session.token);
    setSession(mergeSessionMembership(session, membership));
  }

  function openRedeem() {
    if (!session?.token) {
      router.push(buildRedirect(pathname));
      return;
    }

    if (isPermanentMembership(session.membership)) {
      showToast('当前账号已开通永久 VIP，无需再次激活');
      return;
    }

    setRedeemOpen(true);
  }

  function closeRedeem() {
    setRedeemOpen(false);
    setRedeemCode('');
  }

  async function handleRedeem() {
    if (!session?.token) {
      router.push(buildRedirect(pathname));
      return;
    }

    if (!redeemCode.trim()) {
      showToast('请输入激活码', 'error');
      return;
    }

    setRedeemPending(true);

    try {
      const result = await redeemMembership(session.token, redeemCode.trim(), crypto.randomUUID());
      const membership = await getMembership(session.token);

      setSession(mergeSessionMembership(session, membership));

      showToast(
        result.repeated
          ? `激活码已使用，当前权益到期：${formatDateLabel(result.current_expired_at)}`
          : result.is_permanent
            ? `兑换成功，已开通 ${result.package_name ?? '永久 VIP'}`
            : `兑换成功，权益到期：${formatDateLabel(result.current_expired_at)}`,
      );
      closeRedeem();
    } catch (error) {
      const message = error instanceof Error ? error.message : '兑换失败';
      showToast(message, 'error');
    } finally {
      setRedeemPending(false);
    }
  }

  return (
    <AppContext.Provider
      value={{
        mounted,
        session,
        setSession,
        logout,
        refreshMembership,
        showToast,
        openRedeem,
        closeRedeem,
      }}
    >
      {children}
      {redeemOpen ? (
        <div className="modal-backdrop" onClick={closeRedeem}>
          <div className="redeem-modal" onClick={(event) => event.stopPropagation()}>
            <div className="redeem-modal__hero">
              <div className="redeem-modal__crown">
                <CrownIcon className="redeem-modal__crown-icon" />
              </div>
              <div>
                <h3>VIP 激活兑换</h3>
              </div>
            </div>
            <div className="redeem-modal__body">
              <label className="field">
                <span className="field__label">激活码</span>
                <div className="field__input field__input--mono">
                  <GiftIcon className="field__icon" />
                  <input
                    value={redeemCode}
                    onChange={(event) => setRedeemCode(event.target.value.toUpperCase())}
                    placeholder="ABCD-EFGH-IJKL"
                    maxLength={24}
                  />
                </div>
              </label>
              <button type="button" className="primary-button" onClick={handleRedeem} disabled={redeemPending}>
                {redeemPending ? '激活中...' : '立即激活权益'}
              </button>
              <button type="button" className="ghost-button" onClick={closeRedeem}>
                稍后再说
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {toast ? <div className={`app-toast is-${toast.tone}`}>{toast.message}</div> : null}
    </AppContext.Provider>
  );
}

function mergeSessionMembership(session: AppSession, membership: MembershipSnapshot): AppSession {
  return {
    ...session,
    user_info: {
      ...session.user_info,
      user_level: hasVipMembership(membership) ? 'vip' : 'normal',
    },
    membership,
  };
}

export function useAppContext() {
  const context = useContext(AppContext);

  if (!context) {
    throw new Error('useAppContext must be used within AppProvider');
  }

  return context;
}
