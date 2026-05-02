import type { MembershipSnapshot, MembershipTone } from '@/lib/types';

export function formatCount(value: number) {
  if (value >= 10000) {
    return `${(value / 10000).toFixed(value >= 100000 ? 0 : 1)}w`;
  }

  return String(value);
}

export function formatPercent(value: number) {
  return `${Math.max(0, Math.min(100, Math.round(value)))}%`;
}

export function formatDateLabel(value: string | null) {
  if (!value) {
    return '长期有效';
  }

  const normalized = value.replace(' ', 'T');
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatRelativeTime(value: string | null) {
  if (!value) {
    return '刚刚学习过';
  }

  const date = new Date(value.replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const diff = date.getTime() - Date.now();
  const rtf = new Intl.RelativeTimeFormat('zh-CN', { numeric: 'auto' });
  const minutes = Math.round(diff / (60 * 1000));

  if (Math.abs(minutes) < 60) {
    return rtf.format(minutes, 'minute');
  }

  const hours = Math.round(diff / (60 * 60 * 1000));
  if (Math.abs(hours) < 24) {
    return rtf.format(hours, 'hour');
  }

  const days = Math.round(diff / (24 * 60 * 60 * 1000));
  return rtf.format(days, 'day');
}

export function getInitial(value: string) {
  return value.trim().slice(0, 1) || '学';
}

export function buildRedirect(pathname: string) {
  return `/login?redirect=${encodeURIComponent(pathname)}`;
}

export function getAccessLabel(accessType: string) {
  return accessType === 'vip' ? 'VIP 免费' : 'FREE';
}

export function isPermanentMembership(membership?: MembershipSnapshot | null) {
  return Boolean(membership && (membership.is_permanent || membership.status === 'permanent'));
}

export function hasVipMembership(membership?: MembershipSnapshot | null) {
  if (!membership) {
    return false;
  }

  if (isPermanentMembership(membership)) {
    return true;
  }

  if (membership.status !== 'active') {
    return false;
  }

  if (!membership.expired_at) {
    return true;
  }

  return new Date(membership.expired_at.replace(' ', 'T')).getTime() >= Date.now();
}

export function getMembershipTone(membership?: MembershipSnapshot | null): MembershipTone {
  if (membership?.package_tone) {
    return membership.package_tone;
  }

  if (isPermanentMembership(membership)) {
    return 'gold';
  }

  if (hasVipMembership(membership)) {
    return 'blue';
  }

  return 'slate';
}

export function getMembershipLabel(membership?: MembershipSnapshot | null) {
  if (!membership) {
    return '普通用户';
  }

  if (isPermanentMembership(membership)) {
    return membership.package_name ?? '永久 VIP';
  }

  if (hasVipMembership(membership)) {
    if (membership.expired_at) {
      return `VIP 至 ${formatDateLabel(membership.expired_at)}`;
    }

    return `${membership.package_name ?? 'VIP'} 已开通`;
  }

  if (membership.status === 'expired' && membership.expired_at) {
    return `已于 ${formatDateLabel(membership.expired_at)} 到期`;
  }

  return '普通用户';
}
