'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { BookOpenIcon, FlameIcon, FolderIcon, UserIcon } from '@/components/icons';

const navItems = [
  {
    href: '/',
    label: '同步课',
    icon: BookOpenIcon,
  },
  {
    href: '/topics',
    label: '专题课',
    icon: FlameIcon,
  },
  {
    href: '/library',
    label: '学习库',
    icon: FolderIcon,
  },
  {
    href: '/me',
    label: '我的',
    icon: UserIcon,
  },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="bottom-nav">
      {navItems.map((item) => {
        const active = pathname === item.href;
        const Icon = item.icon;

        return (
          <Link key={item.href} href={item.href} className={`bottom-nav__item${active ? ' is-active' : ''}`}>
            <Icon className="bottom-nav__icon" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
