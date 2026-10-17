# PingMe 接口清单

接口前缀 `/api`。JSON 响应；错误为非 2xx 和 `{error}`。管理会话使用 HttpOnly、Secure、SameSite=Strict Cookie。所有后台写入必须携带本站 Origin。未登录后台数据返回 401；会话检查返回 authenticated=false，不返回私有数据。验证码已取消，提交频率和附件大小限制保留。

## 后台接口

| 方法 | 路径 | 用途、参数及返回 |
| --- | --- | --- |
| POST | /admin/login | `{password}`，非空密码；返回 ok、snapshot，并写入会话 Cookie。snapshot 包含 projects、categories、tickets（前 50 条）、ticketTotal、about。 |
| GET | /admin/me | 返回 authenticated；已登录时附带 snapshot，用于直接恢复后台。 |
| POST | /admin/logout | 清除会话 Cookie。 |
| POST | /admin/password | `{currentPassword,newPassword,confirmPassword}`；新密码任意非空，最多 128 字符。哈希保存并撤销旧会话，成功后重新登录。 |
| GET | /admin/tickets | 查询 `status,project,q,page,limit`；project 为 slug，q 匹配标题或编号；page 默认 1，limit 默认 50、最多 100。返回 tickets、total、page、limit。按更新时间和 ID 倒序稳定排列；列表标题只返回前 200 字符摘要，完整标题和描述通过详情读取，数据库内容不会截断。 |
| GET | /admin/tickets/:id | 返回 ticket（含联系方式）、messages（含内部备注）、attachments、notification（企业微信回执）。 |
| PATCH | /admin/tickets/:id | `{status}`；new/progress/resolved/closed。返回 ok 和数据库中实际保存的 ticket，可立即刷新再核对。 |
| POST | /admin/tickets/:id/reply | `{body,internal,status?}`；body 必填，internal=true 为内部备注；可同时更新状态，数据库批量事务写入。返回 ticket 和 messages。 |
| POST | /admin/tickets/:id/notify | 对未成功的企业微信通知重新发送；成功的通知不重复发送。返回 notification。unknown 表示回执不确定，重试前应先检查企业微信；失败不能影响原反馈。 |
| GET | /admin/projects | 返回所有项目，包括不公开项目、原始图片链接、图片版本和三个展示接收标记。 |
| POST | /admin/projects | 新增项目；JSON 或 multipart，返回 ok、slug、image_url。 |
| PATCH | /admin/projects/:slug | 保存项目；项目路径不变，字段同新增。图片版本不一致返回 409。 |
| POST | /admin/project-image-source | `{url}`，获取外部图片供浏览器压缩；返回图片字节。仅允许公开 HTTP/HTTPS 主机，检查 DNS、私有地址及跳转，原图最多 5MB。 |
| GET | /admin/categories | 返回 categories。 |
| POST | /admin/categories | `{id,name,description,sort_order}`。id 唯一；名称必填；排序为 0–1000000 整数。 |
| PATCH | /admin/categories/:id | 保存分类名称、说明及排序。 |
| DELETE | /admin/categories/:id | 仅删除空分类；默认 other 分类不可删除。 |
| GET | /admin/about | 返回 personal、version。 |
| PUT | /admin/about | `{personal,version}`，原子版本检查，不覆盖其他页面已保存内容；冲突返回 409；成功返回新 personal、version。 |

### 项目保存字段

name、slug（新增必填）、description、official_url、category、sort_order、homepage_visible、visible、enabled、image_action（keep/replace/remove）、image_source、image_version。三个标记分别控制个人主页展示、反馈首页展示、接收反馈。图片替换使用 multipart：data 为上述 JSON，image 为经过浏览器缩放至不超过 144×144、128KiB 的 WebP/PNG。保存后使用站内 R2 图片；原始外链更改后重新获取、处理和保存，旧对象清理。保留图片时不重新获取外链。

### 关于页配置

personal 包含 name、bio、avatar、homeUrl、homeLabel、feedbackLabel、contactTitle、communityTitle、sitesTitle、supportTitle、supportText，以及 contacts、communities、sites、support 四组条目。条目含 platform、value、icon、visible、mode；link 模式保存 href/action，copy 模式复制 value，qr 模式保存 qr/scanner/download。每组最多 20 个。公开接口过滤 visible=false 条目，后台保留。

## 公开接口

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | /projects | 反馈首页的开放项目及分类；不公开、停止接收的项目不列出。 |
| GET | /projects/:slug | 正在接收反馈的指定项目。 |
| GET | /catalog | 个人主页共享项目目录；仅 homepage_visible=1；绝对图片/反馈地址、ETag、CORS，缓存 60 秒。 |
| GET | /about | 公开个人资料，剔除隐藏条目。 |
| GET | /config | 兼容旧客户端，turnstileSiteKey 为空，不启用 CF 验证。 |
| GET/HEAD | /project-images/:uuid.webp 或 .png | 当前仍被项目引用的 R2 图片，版本 URL 长期缓存。 |
| POST | /tickets | multipart：project、kind、title、body 必填；title/body 任意非空，不设最短或最长字符数，也不静默截断。可附 app_version、platform、contact、files。返回 number、私密 url；后台异步发送企业微信通知。 |
| GET | /t/:token | 私密 token 查反馈、公开回复、附件列表；不返回内部备注或联系方式。 |
| POST | /t/:token/reply | multipart：body 或 files 至少一项；关闭的反馈不能继续回复。 |
| GET | /attachments/:id | 后台会话或属于此附件反馈的有效 token 才能下载；不允许跨反馈访问附件。 |

附件最多 5 个，每个 10MB。限流：新反馈 8 次/小时，访客回复 15 次/小时，登录 8 次/15 分钟，修改密码 5 次/15 分钟，图片导入 30 次/小时，通知重试 10 次/小时。本文的字符无限制不改变 HTTP 平台及数据库的物理容量。

## 企业微信通知

Worker secrets：WECOM_CORP_ID、WECOM_SECRET、WECOM_AGENT_ID、WECOM_TO_USER；PUBLIC_SITE_URL 为公开站点地址。凭据只通过本机已授权的私密配置注入，不提交源码。消息使用 text，包含项目、编号、标题、内容摘要和后台详情地址；按 UTF-8 字节裁剪摘要，保留完整入口。通知不包含反馈访问 token、联系方式和附件内容。

feedback_notifications 记录 pending/sending/sent/failed/unknown/disabled、回执 ID 及错误。只有企业微信明确拒绝过期令牌才自动换令牌重试；请求结果未知不盲目重复发送。未配置或发送失败不会导致反馈提交失败。发布前执行 migrations/20261018-feedback-notifications.sql。
