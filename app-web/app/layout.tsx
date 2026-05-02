import type { ReactNode } from 'react';
import type { Metadata } from 'next';

import { AppProvider } from '@/components/app-provider';
import '@/app/globals.css';

export const metadata: Metadata = {
  title: '优学课堂',
  description: '基于 Next.js 16 构建的优学课堂用户端前台',
};

export const dynamic = 'force-dynamic';

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  );
}
