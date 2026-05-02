# PrimeClass App Web

统一的 Next.js 16 前端工程，包含：

- 学员端：`/`
- 后台管理端：`/admin`

## Development

1. 复制 `.env.local.example` 为 `.env.local`
2. 调整接口地址
3. 执行 `npm install`
4. 执行 `npm run dev`

默认开发端口：`3001`

## Production

1. 复制 `.env.production.example` 为 `.env.production`
2. 执行 `npm install`
3. 执行 `npm run build`
4. 执行 `npm start`

生产部署建议配合根目录 `deploy/` 下的 PM2 与 Nginx 示例文件。
