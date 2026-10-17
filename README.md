# PingMe

独立项目反馈中心。每个项目使用 `/<slug>` 收集问题与建议，后台 `/admin` 统一管理项目、反馈和个人资料。个人主页通过 `/api/catalog` 使用同一份项目目录。

## 功能

- 公开项目目录、分类和搜索；每条反馈有独立私密查询链接。
- 标题、描述任意非空，不设最短或最长字符数；不使用 CF 验证。保留提交限流。
- 每条反馈最多 5 个附件，每个 10MB；访客可以回复和补充附件。
- 后台收件箱支持搜索、项目与状态筛选、分页、状态保存、公开回复和内部备注。
- 项目管理支持官网、分类、排序、主页展示、反馈展示和是否接收反馈。
- 图片可上传或填写直链，保存时自动处理成最长边 144px 的 WebP，存入本站 R2；外链变化或主动更新时重新获取，替换后清理旧对象。
- 分类维护及个人资料、联系方式、社交账号、个人站点、支持开发配置。
- 新反馈通过企业微信应用发送 text 通知，后台显示发送回执，失败可手动重试。
- 桌面和手机使用单一主内容区及正常网页滚动。原生 HTML/CSS/JavaScript，不依赖 React、Ant Design 或运行时组件构建。

完整接口及数据约定见 [docs/ADMIN-API.md](docs/ADMIN-API.md)。重构验收范围见 [docs/ADMIN-REBUILD.md](docs/ADMIN-REBUILD.md)。

## 部署

需要 Node.js 22.13+、npm 和开通 Workers、D1、R2 的 Cloudflare 账户。公开仓库配置是通用模板，不包含维护者的生产账户与凭据。

```sh
npm ci
cp wrangler.example.jsonc wrangler.jsonc
npx wrangler login
npx wrangler d1 create pingme-db
npx wrangler r2 bucket create pingme-attachments
```

将数据库 ID 填入 wrangler.jsonc，保持数据库和存储桶名称一致，然后初始化并设置密钥：

```sh
npm run db:remote
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put SESSION_SECRET
npm run deploy
```

ADMIN_PASSWORD 为初始非空密码，SESSION_SECRET 为独立随机长字符串。后台修改密码后以 D1 哈希为准，所有旧会话失效。不要把 `.dev.vars`、私密部署配置、密码或企业微信配置提交到仓库。

已有部署只执行缺失的迁移，不重新导入 schema.sql 覆盖业务数据。本次通知功能先执行 `migrations/0007_feedback_notifications.sql`。之前的目录升级依次执行 `20261013-unified-catalog.sql`、部署对应 Worker、再执行 `20261013-remove-legacy-project-fields.sql`；关于页迁移为 `20261012-about-settings.sql`。含 ALTER TABLE 的迁移不能重复执行。

## 企业微信应用通知

将 WECOM_CORP_ID、WECOM_SECRET、WECOM_AGENT_ID、WECOM_TO_USER 设置为 Worker secrets。可选 PUBLIC_SITE_URL（例如 https://pingme.pm）用于生成后台详情入口。企业微信应用必须对接收成员可见，并符合企业微信的可信 IP 配置。

消息包含项目、编号、标题和内容摘要，摘要按 UTF-8 字节裁剪以符合企业微信接口限制；完整反馈仍保存在 D1。消息不包含私密查询 token、联系方式或附件。推送失败不影响提交成功；若没有收到明确回执，先确认企业微信是否收到，再手动重试，避免重复消息。

## 本地开发与验证

复制 `.dev.vars.example` 到 `.dev.vars`，设置本地密码和会话密钥，然后：

```sh
npm ci
npm run db:local
npm run dev
npm run check
npm test
```

浏览器直接使用源码，没有后台打包步骤。`tests/integration.py` 对指定的本地开发地址执行真实 API 流程，只允许 loopback 主机，不能对生产地址运行。测试会写入本地演示项目和反馈，需使用独立开发数据库。

## 数据和权限

- 反馈 token 仅保存 SHA-256 摘要。拥有私密链接的人可查看反馈及公开回复。
- 内部备注和联系方式仅后台可见；附件只允许管理员或该反馈 token 下载。
- 后台写入校验本站 Origin。图片导入拒绝私有地址和不安全跳转。
- 密码使用 PBKDF2 哈希，会话使用 HttpOnly、Secure、SameSite Cookie，登录及写入端点保留频率限制。
- 关于配置使用版本检查，防止覆盖其他页面已保存的数据；项目图片也有版本冲突保护。
- 所有图片和反馈保存在 D1/R2；源码更新不导入开发数据。

## 目录

- `public/app.js` 公开页面与路由
- `public/admin.js`、`public/admin.css` 原生后台
- `public/admin-image.js` 浏览器图片压缩
- `src/worker.js` API、鉴权、附件
- `src/project-catalog.js` 项目目录与分类
- `src/project-images.js` 图片缓存、导入与项目保存
- `src/about-settings.js` 个人资料验证与存储
- `src/wecom.js` 企业微信通知与回执
- `schema.sql` 新部署初始化；`migrations/` 旧部署增量升级
