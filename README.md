# 优学课堂

统一的网课系统项目，当前已经完成：

- 学员端前台：Next.js 16
- 后台管理端：Next.js 16，同一前端工程下的 `/admin`
- 后端 API：Node.js + TypeScript + Fastify + MySQL
- 会员体系：仅支持激活码，不做第三方充值
- 存储支持：`local`、`s3`、`tencent_cos`、`ftp`

## 项目结构

```text
<project-root>
├── app-web    # 统一前端工程，包含学员端和后台端
├── server     # 后端 API 服务
├── deploy     # PM2 / Nginx 部署示例
└── docs       # 设计、接口、数据库、部署文档
```

## 访问入口

- 学员端：首页 `/`
- 后台端：`/admin`
- App API：`/api/v1/app`
- Admin API：`/api/v1/admin`

开发环境默认端口：

- 前端：`3001`
- 后端：`3000`

## 技术栈

### 前端

- Next.js 16
- React 19
- TypeScript

### 后端

- Node.js
- Fastify
- TypeScript
- MySQL

## 本地启动

### 1. 启动后端

```bash
cd server
cp .env.example .env
npm install
SEED_ADMIN_PASSWORD='set-a-local-admin-password' SEED_APP_PASSWORD='set-a-local-demo-password' npm run db:bootstrap
npm run build
npm run dev
```

推荐在初始化数据库时显式设置本地开发密码；如果不传 `SEED_ADMIN_PASSWORD` / `SEED_APP_PASSWORD`，`npm run db:bootstrap` 会随机生成并输出本次凭据。

本地数据库示例配置：

- `MYSQL_HOST=127.0.0.1`
- `MYSQL_PORT=3306`
- `MYSQL_DATABASE=primeclass`
- `MYSQL_USER=root`

### 2. 启动前端

```bash
cd app-web
cp .env.local.example .env.local
npm install
npm run dev
```

## 初始化账号

### 后台管理员

- 账号：`admin`
- 密码：由 `npm run db:bootstrap` 输出或由本地手工设置

### 学员演示账号

- 账号：`student_demo`
- 密码：由 `npm run db:bootstrap` 输出或由本地手工设置

## 已完成模块

- 用户管理
- 课程管理
- 课时管理
- 专题标签
- 会员套餐
- 激活码批次
- 激活码兑换记录
- 系统设置
- 字典配置
- 存储配置
- 学员首页
- 专题课
- 学习库
- 我的页面
- 课时播放与学习进度

## 重要说明

- 旧的 `admin-web` 已移除，前后台统一到 `app-web`
- 前端样式参考 `docs/demo.html` 重构
- 后端数据库为 MySQL
- 当前会员体系只支持激活码，不支持第三方充值

## 文档入口

- 项目设计规范：[docs/项目设计规范.md](docs/项目设计规范.md)
- AI 设计协作：[docs/AI设计协作文档.md](docs/AI设计协作文档.md)
- API 清单：[docs/API接口清单.md](docs/API接口清单.md)
- 数据库设计：[docs/数据库表结构设计.md](docs/数据库表结构设计.md)
- 表结构 SQL：[docs/schema.mysql.sql](docs/schema.mysql.sql)
- 部署说明：[docs/部署上线说明.md](docs/部署上线说明.md)

## 部署入口

部署相关文件位于：

- `deploy/ecosystem.config.cjs`
- `deploy/nginx.primeclass.conf.example`

如需生产部署，直接查看：

- [docs/部署上线说明.md](docs/部署上线说明.md)
