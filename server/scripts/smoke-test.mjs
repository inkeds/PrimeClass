import 'dotenv/config';

import { buildServer } from '../dist/server.js';

const adminUsername = process.env.SMOKE_ADMIN_USERNAME ?? process.env.SEED_ADMIN_USERNAME ?? 'admin';
const adminPassword = requireEnv('SMOKE_ADMIN_PASSWORD', process.env.SEED_ADMIN_PASSWORD);
const appAccount = process.env.SMOKE_APP_ACCOUNT ?? process.env.SEED_APP_ACCOUNT ?? 'student_demo';
const appPassword = requireEnv('SMOKE_APP_PASSWORD', process.env.SEED_APP_PASSWORD);

const server = await buildServer();

try {
  const adminLogin = await requestJson(server, {
    method: 'POST',
    url: '/api/v1/admin/auth/login',
    payload: {
      username: adminUsername,
      password: adminPassword,
    },
  });

  const adminToken = adminLogin.data.token;
  const adminHeaders = authHeaders(adminToken);

  const dashboard = await requestJson(server, {
    method: 'GET',
    url: '/api/v1/admin/dashboard/overview',
    headers: adminHeaders,
  });

  const dictionaries = await requestJson(server, {
    method: 'GET',
    url: '/api/v1/admin/dictionaries',
    headers: adminHeaders,
  });

  const packages = await requestJson(server, {
    method: 'GET',
    url: '/api/v1/admin/membership/packages?page=1&page_size=10',
    headers: adminHeaders,
  });

  const packageId = packages.data.list[0]?.package_id;
  assert(packageId, '会员套餐为空，无法继续冒烟测试');

  const batch = await requestJson(server, {
    method: 'POST',
    url: '/api/v1/admin/membership/code-batches',
    headers: adminHeaders,
    payload: {
      package_id: packageId,
      quantity: 1,
      source_channel: 'smoke_test',
      remark: 'smoke_test',
    },
  });

  const batchNo = batch.data.batch_no;
  assert(batchNo, '未获取到激活码批次号');

  const codes = await requestJson(server, {
    method: 'GET',
    url: `/api/v1/admin/membership/codes?batch_no=${encodeURIComponent(batchNo)}&page=1&page_size=10`,
    headers: adminHeaders,
  });

  const activationCode = codes.data.list[0]?.code;
  assert(activationCode, '未获取到新生成的激活码');

  const appLogin = await requestJson(server, {
    method: 'POST',
    url: '/api/v1/app/auth/login',
    payload: {
      login_type: 'password',
      account: appAccount,
      password: appPassword,
    },
  });

  const appToken = appLogin.data.token;
  const appHeaders = authHeaders(appToken);

  const home = await requestJson(server, {
    method: 'GET',
    url: '/api/v1/app/home',
    headers: appHeaders,
  });

  const subjects = await requestJson(server, {
    method: 'GET',
    url: '/api/v1/app/subjects',
  });

  const versions = await requestJson(server, {
    method: 'GET',
    url: '/api/v1/app/versions?subject=math&grade=high_1',
  });

  const syncCourses = await requestJson(server, {
    method: 'GET',
    url: '/api/v1/app/courses/sync?subject=math&grade=high_1&version=pep&page=1&page_size=10',
    headers: appHeaders,
  });

  const membershipBefore = await requestJson(server, {
    method: 'GET',
    url: '/api/v1/app/membership',
    headers: appHeaders,
  });

  const redeem = await requestJson(server, {
    method: 'POST',
    url: '/api/v1/app/membership/redeem',
    headers: {
      ...appHeaders,
      'idempotency-key': `smoke-${Date.now()}`,
    },
    payload: {
      code: activationCode,
    },
  });

  const membershipAfter = await requestJson(server, {
    method: 'GET',
    url: '/api/v1/app/membership',
    headers: appHeaders,
  });

  console.log(
    JSON.stringify(
      {
        admin: {
          username: adminLogin.data.admin_info.username,
          permission_count: adminLogin.data.permissions.length,
        },
        dashboard: dashboard.data,
        dictionaries: dictionaries.data.pagination.total,
        membership_packages: packages.data.pagination.total,
        generated_batch_no: batchNo,
        generated_code_status: codes.data.list[0]?.status ?? null,
        app_user: appLogin.data.user_info.nickname,
        home: {
          current_version: home.data.current_version,
          subject_count: home.data.subject_list.length,
          sync_course_count: home.data.sync_course_list.length,
        },
        subjects: subjects.data.length,
        versions: versions.data.length,
        sync_courses: syncCourses.data.pagination.total,
        membership_before: membershipBefore.data.status,
        redeem_result: redeem.data.result_status ?? 'success',
        membership_after: membershipAfter.data.status,
      },
      null,
      2,
    ),
  );
} finally {
  await server.close();
}

async function requestJson(server, options) {
  const response = await server.inject(options);
  const payload = response.json();

  if (response.statusCode >= 400 || payload.code !== 0) {
    throw new Error(
      `Request failed: ${options.method} ${options.url} -> ${response.statusCode} ${JSON.stringify(payload)}`,
    );
  }

  return payload;
}

function authHeaders(token) {
  return {
    authorization: `Bearer ${token}`,
  };
}

function assert(value, message) {
  if (!value) {
    throw new Error(message);
  }
}

function requireEnv(name, fallbackValue) {
  if (fallbackValue) {
    return fallbackValue;
  }

  throw new Error(`Missing required environment variable: ${name}`);
}
