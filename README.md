# PingMe

面向个人多个项目的独立反馈中心。所有项目仅需跳转到 `https://pingme.pm/<slug>`，无需接入 SDK/API。

## 功能

- 响应式首页：项目分类、搜索、电脑三列与手机单列；仅浅色模式
- 项目专属反馈页：反馈 BUG / 功能不可用 / 期待更新 / 提出建议
- 文本、版本与系统环境信息；支持拖拽、粘贴、批量附件（每条最多 5 个、每个 10 MB）
- 匿名提交；反馈编号与独立私密查询令牌；访客回复与补充附件
- 管理员单密码登录、后台修改密码；收件箱搜索、分页、状态修改、公开回复、内部备注
- 项目搜索、分类筛选、分页及单项目编辑；配置项目官网、首页可见性及开放状态
- D1 数据库、私有 R2 附件、Turnstile（生产环境建议强制开启）、服务端 IP 限流

## 自行部署到 Cloudflare

依赖 Node.js 22.13+、npm、Git，以及已开通 Workers、D1 和 R2 的 Cloudflare 账户。前端使用原生 HTML/CSS/JavaScript，生产运行在 Workers，无需额外前端构建步骤。

仓库中的 `wrangler.jsonc` 是通用部署模板，不包含维护者的 Cloudflare 账户、数据库 ID 或域名路由。填写自己的资源与密钥后即可部署：

```sh
git clone https://github.com/5hux1n/pingme.git
cd pingme
npm ci
cp wrangler.example.jsonc wrangler.jsonc
npx wrangler login
npx wrangler d1 create pingme-db
npx wrangler r2 bucket create pingme-attachments
```

把创建数据库返回的 ID 填入 `wrangler.jsonc` 的 `database_id`。如修改资源名，配置、命令及 package.json 中的数据库名需要对应一致。

在 Cloudflare 控制台创建 Turnstile 站点，将部署域名加入允许列表，并将 Site Key 填入 `TURNSTILE_SITE_KEY`。接着初始化数据库并设置密钥：

```sh
npm run db:remote
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put SESSION_SECRET
npx wrangler secret put TURNSTILE_SECRET
npm run deploy
```

- `ADMIN_PASSWORD`：初始管理员密码。后台修改后，以数据库保存的密码摘要为准；旧初始密码不再可用。
- `SESSION_SECRET`：独立的随机长字符串，用于签名登录会话。
- `TURNSTILE_SECRET`：该 Turnstile 站点对应的 Secret Key，不能填 Site Key。

使用部署输出的 `workers.dev` 地址，或绑定自己的自定义域名。Turnstile 的允许域名需与实际访问域名一致。后台位于 `/admin`，无需用户名。修改密码需验证当前密码，成功后所有旧会话失效，需要重新登录。

初始数据包含维护者的项目。部署个人站点前，可修改 `schema.sql` 的初始项目和 `public/project-catalog.js` 的分类、图标；个人资料及打赏配置位于 `public/about-data.js`。项目名称、简介、官网和开放状态可在后台修改。请勿将 `.dev.vars`、`.deploy-secrets.json` 或 `.admin-credentials.txt` 提交到公开仓库。

已部署旧版本时按实际版本执行缺失的 `migrations/` 文件；不要重复执行带 `ALTER TABLE` 的迁移，也不要用初始化脚本覆盖已有自定义资料。

## 本地开发

- 初始化：`npm install && npm run db:local`
- 本地密钥：复制 `.dev.vars.example` 为 `.dev.vars`，设置本地管理员密码与 session secret。
- 启动：`npm run dev`

通用部署模板默认开启 Turnstile；本地可设置 `TURNSTILE_REQUIRED=false`，或使用官方测试 key。**生产环境务必启用**。如在本地启用 Turnstile，需自行配置测试用 site key 与 secret。

## 数据安全及限制

- D1 仅保存反馈查询令牌的 SHA-256 摘要；无法根据反馈编号推断私密查询链接。保存查询链接的人拥有该反馈的访问权，请提醒用户妥善保管。
- 所有 R2 对象为私有。下载必须携带私密查询令牌或管理员 session。文件强制以附件形式下载，避免用户上传 HTML/SVG 等攻击内容被执行。
- 不在前端暴露后台密码和 Secret；后台登录使用 `HttpOnly; Secure; SameSite=Strict` cookie。
- 限流基于 Cloudflare IP + D1，适合低流量独立项目，非高并发防刷基础设施。大流量场景建议引入 WAF / 更强的限流策略。
- 文件限制以服务器端扩展名、MIME、大小进行基础校验，**不等同于病毒扫描**。不要在服务器执行上传的文件；管理员下载未知日志、压缩包前要自行检查。
- 崩溃日志可能包含用户名、路径、令牌等个人信息：提交时提示用户检查，建议配置清理/保留政策。
- 当前没有邮件推送、注册系统、附件内容预览、实时监控、自动崩溃抓取或项目 SDK。这些不属于此版本范围。
- 为保持部署简单，未引入前端构建工具；直接编辑 `public/` 与 `src/worker.js` 即可。

## 目录

- `public/index.html` 页面入口
- `public/style.css` 样式与响应式布局
- `public/app.js` 访客前端（单页路由）
- `public/admin.js` 管理后台工作区与修改密码
- `src/worker.js` API、认证、文件上传与权限
- `schema.sql` D1 建表与样例数据
- `wrangler.jsonc` 自行部署配置
- `wrangler.example.jsonc` 自行部署通用配置

## 交付说明

使用 `pingme.pm/codexm` 等链接从各项目跳转即可，无须在项目中加载脚本。

## 许可证

项目代码采用 [MIT License](LICENSE)。字体及第三方平台、项目图标保留各自的许可与权利，详见 [NOTICE.md](NOTICE.md)。示例中含维护者的公开项目、个人资料和收款码，部署自己的站点时请替换为自己的资料。

## 关于页面配置

登录 `/admin`，选择“关于页面”，可以编辑个人资料、联系方式、社交账号、个人站点和支持开发。条目支持新增、删除、上下排序、隐藏，以及链接 / 复制账号 / 二维码等点击行为。保存后直接生效，无需重新部署；头像及二维码支持现有站内图片路径或 HTTPS 图片地址。

首次启用前对已有数据库执行 `migrations/20261012-about-settings.sql`；新部署的 `schema.sql` 已包含该表。未保存配置时沿用现有关于页内容。配置存入 D1，已有反馈和项目资料不会被覆盖。
