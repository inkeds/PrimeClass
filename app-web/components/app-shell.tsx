import type { ReactNode } from 'react';

import { BottomNav } from '@/components/bottom-nav';

type AppShellProps = {
  children: ReactNode;
  showNav?: boolean;
  className?: string;
};

export function AppShell({ children, showNav = true, className = '' }: AppShellProps) {
  return (
    <div className="mobile-page">
      <div className={`mobile-page__frame ${className}`.trim()}>{children}</div>
      {showNav ? <BottomNav /> : null}
    </div>
  );
}
