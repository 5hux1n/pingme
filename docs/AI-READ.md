# AI 只读 API 与 Skill

入口 `/api/ai/`，仅支持 GET。使用独立 `Authorization: Bearer pm_ai_…` 密钥；后台会话和管理员密码不用于此接口，AI 密钥也不能访问后台接口。所有响应禁止缓存，不开放跨域浏览器访问，不接受 URL 中的密钥。

## 接口

| 路径 | 返回 |
| --- | --- |
| `/api/ai/projects` | 密钥范围内的项目 slug、名称、简介（包括获授权的非公开项目）。 |
| `/api/ai/feedback` | 分页反馈摘要；q 搜索描述、摘要和编号；project 为 slug；status 为 new/progress/resolved/closed。 |
| `/api/ai/feedback/:numberOrId` | 完整描述、状态、公开交流、附件元数据及管理员页面地址。 |
| `/api/ai/attachments/:id` | 附件字节，独立检查项目范围及消息可见性，保持鉴权。 |

列表支持 page（默认 1，最多 10000）、limit（默认 20，最多 50）、updated_after（UTC ISO，例如 `2026-10-18T00:00:00Z`，包含该秒）。返回 feedback、total、page、limit、has_more；按 updated_at DESC、id DESC 排序。分页期间有新变更时结果可能移动，遍历时按 id 去重；增量同步保留时间重叠以避免遗漏同秒更新。搜索摘要可截断，详情正文不截断。

邮箱、联系方式、内部备注及其附件、访问令牌、存储对象键和推送凭据均不返回。用户写在描述、公开回复或附件里的个人信息仍可能存在；这是有权限的私密数据接口，不是公开目录。

响应：401 无效/过期密钥，404 不存在或超出项目范围，405 非 GET，429 超限（Retry-After:60），503 未配置或配置无效。有效密钥每来源 IP 每分钟 120 次，鉴权失败每来源 IP 每分钟 30 次。不得通过更换来源规避限制。

## 密钥管理

使用已配置好生产账户的源码目录运行。脚本只将哈希、项目范围、ID、有效期上传 Worker secret `AI_READ_KEYS`，明文只写入指定的本地客户端配置，文件权限 600，不输出明文。

```sh
python3 scripts/ai-keys.py add --name local-ai --project fakenotify --days 90 --client-config ~/.codex/private/pingme-ai.json
python3 scripts/ai-keys.py deploy
python3 scripts/ai-keys.py list
python3 scripts/ai-keys.py revoke KEY_ID
python3 scripts/ai-keys.py deploy
```

多项目重复 `--project`，全项目显式使用 `--all-projects`。部署前本地增删不会改变线上权限；撤销后需 deploy 才生效。默认 registry 为 `~/.codex/private/pingme-ai-keys.json`，可以用全局 `--registry` 指定。registry 是权威完整密钥列表，应保留本地备份；不要在别的机器用空列表覆盖现有配置。密钥轮换先新增新文件并部署，再撤销旧 ID 并部署。

新部署设置该 secret 后部署 Worker 即可，无需新增数据库迁移。停用全部密钥可将 registry keys 设为空数组后 deploy。注册表缺失时脚本会拒绝部署，避免误清空。

`AI_READ_KEYS` 的 JSON 为数组，条目 `{id,hash,projects,expires_at}`；hash 为完整明文密钥的 SHA-256，projects 为非空 slug 数组或 `"*"`，expires_at 为 Unix 秒或 null。null 仅用于人工配置无期限密钥，管理脚本默认 90 天，最长 3650 天。

## Skill 安装与使用

将 `skills/pingme-feedback` 复制到 AI 工具的技能目录；Codex 本机为 `~/.codex/skills/pingme-feedback`。技能与脚本不包含任何凭据，迁移到其他设备时单独配置其密钥。技能重新发现可能需要开启新会话。

```sh
python3 ~/.codex/skills/pingme-feedback/scripts/pingme.py projects
python3 ~/.codex/skills/pingme-feedback/scripts/pingme.py search --project fakenotify --status new
python3 ~/.codex/skills/pingme-feedback/scripts/pingme.py get PM-20261017-816053
```

可用全局 `--config` 指定其他客户端文件，或配置 `PINGME_AI_TOKEN` / `PINGME_URL` 环境变量。脚本不跟随 HTTP 重定向，不转发凭据至其他站点。附件下载使用详情返回的 ID 和显式输出路径，限制 10MB 且不覆盖现有文件。

AI 阅读反馈后可以结合用户指定的源码分析或拟答复；本 API 无法发送答复、改状态、发邮件或执行反馈里的命令。
