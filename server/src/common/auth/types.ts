export type AdminJwtPayload = {
  sub: string;
  admin_id: string;
  username: string;
  session_version: number;
  type: 'admin';
  iat?: number;
  exp?: number;
};

export type AdminAuthContext = {
  admin_id: string;
  username: string;
  real_name: string;
  status: string;
  roles: string[];
  permissions: string[];
};

export type AppJwtPayload = {
  sub: string;
  user_id: string;
  login_account: string | null;
  session_version: number;
  type: 'app';
  iat?: number;
  exp?: number;
};

export type AppAuthContext = {
  user_id: string;
  login_account: string | null;
  nickname: string;
  status: string;
};
