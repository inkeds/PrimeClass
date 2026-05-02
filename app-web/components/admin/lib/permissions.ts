export type AdminRouteRule = {
  href: string;
  exact?: boolean;
  requiredPermissions: string[];
};

export const ADMIN_ROUTE_RULES: AdminRouteRule[] = [
  { href: '/admin', exact: true, requiredPermissions: ['dashboard.view'] },
  { href: '/admin/courses', requiredPermissions: ['courses.view'] },
  { href: '/admin/content-dimensions', requiredPermissions: ['courses.view'] },
  { href: '/admin/users', requiredPermissions: ['users.view'] },
  { href: '/admin/membership', requiredPermissions: ['membership.view'] },
  { href: '/admin/dictionaries', requiredPermissions: ['system.view'] },
  { href: '/admin/notifications', requiredPermissions: ['system.view'] },
  { href: '/admin/settings', requiredPermissions: ['system.view'] },
];

export function hasAdminPermission(permissions: string[], requiredPermissions: string[]) {
  return requiredPermissions.some((permission) => permissions.includes(permission));
}

export function getAdminRouteRule(pathname: string) {
  return ADMIN_ROUTE_RULES.find((rule) =>
    rule.exact ? pathname === rule.href : pathname === rule.href || pathname.startsWith(`${rule.href}/`),
  );
}

export function canAccessAdminPath(pathname: string, permissions: string[]) {
  const matchedRule = getAdminRouteRule(pathname);

  if (!matchedRule) {
    return true;
  }

  return hasAdminPermission(permissions, matchedRule.requiredPermissions);
}

export function getFirstAccessibleAdminPath(permissions: string[]) {
  return ADMIN_ROUTE_RULES.find((rule) => hasAdminPermission(permissions, rule.requiredPermissions))?.href ?? '/admin/login';
}
