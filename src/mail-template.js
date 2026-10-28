// src/mail-template.js — PingMe 反馈通知邮件（液态玻璃版）
// 入参：heading 决定场景；links 为用户邮件底部的「关注更新」（见 mail-links.js），不传时用内置个人站点。
//
// 视觉沿用 pingme.pm / mjh.im：浅蓝灰底 + 蓝青光斑、半透明白卡、内高光、柔和投影、紫色胶囊按钮。
// 不用 backdrop-filter：部分邮件 App 的 WebKit 不按圆角裁剪模糊区域，会露出直角方块；底下只有渐变，模糊本来也看不出。
// 圆角元素不加 bgcolor 兜底（个别客户端会画成直角白底）；Gmail 等保留半透明卡片和光斑渐变；
// Outlook 桌面版回落到纯色底 + 白卡（bgcolor 属性兜底）。

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const lines = (value) => escape(value).replace(/\r\n?/g, "\n").replace(/\n/g, "<br>");
const url = (value) => {
  const u = new URL(value);
  if (!["https:", "http:"].includes(u.protocol) || u.username || u.password) throw Error("Invalid mail link");
  return u.href;
};

// ---- 设计变量 ----
const C = {
  ground: "#eef3f8", ink: "#17181f", body: "#2a2d36", muted: "#5d6474", faint: "#8a90a0",
  accent: "#6c5be9", accentSoft: "rgba(108,91,233,.10)", line: "rgba(23,24,31,.08)",
  glass: "rgba(255,255,255,.62)", glassSolid: "#fbfcfe", inner: "rgba(255,255,255,.55)"
};
const FONT = "-apple-system,BlinkMacSystemFont,'PingFang SC','Hiragino Sans GB','Microsoft YaHei','Segoe UI',Arial,sans-serif";
const MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";
const BLOBS = "radial-gradient(circle at 88% 0%,rgba(110,175,255,.42),rgba(110,175,255,0) 46%),radial-gradient(circle at 0% 72%,rgba(110,220,230,.38),rgba(110,220,230,0) 48%)";
const GLASS = `background-color:${C.glass};box-shadow:inset 1.5px 1.5px 1px rgba(255,255,255,.85),inset -1px -1px 1px rgba(255,255,255,.4),0 10px 30px -12px rgba(40,40,90,.16)`;

// 状态：顺序即处理流程；“不受理”是分支，不进进度条
const FLOW = ["new", "progress", "resolved", "completed"];
const TONES = {
  new:       { label: "待审核", fg: "#8a5300", bg: "rgba(245,166,35,.16)" },
  progress:  { label: "沟通中", fg: "#1d5c99", bg: "rgba(64,150,255,.15)" },
  resolved:  { label: "待解决", fg: "#5242c4", bg: "rgba(108,91,233,.14)" },
  closed:    { label: "不受理", fg: "#545b66", bg: "rgba(23,24,31,.07)" },
  completed: { label: "已完结", fg: "#1b6e3e", bg: "rgba(46,170,96,.15)" }
};
const codeOf = (code, label) => TONES[code] ? code : Object.keys(TONES).find((k) => TONES[k].label === label) || "closed";

// 场景：谁收、标题、正文由谁说、说明
const SCENES = {
  "反馈已提交": {
    title: "已收到您的反馈", speaker: "您的反馈", flow: true,
    lead: "开发者审核后会通过邮件回复您。在此期间如有补充，直接回复这封邮件即可。",
    subject: (p) => `[PingMe] 已收到您关于【${p}】的反馈`
  },
  "开发者回复了反馈": {
    title: "开发者回复了您", speaker: "开发者", flow: true,
    subject: (p) => `[PingMe] 【${p}】开发者回复了您的反馈`
  },
  "反馈状态更新": {
    title: "反馈状态已更新", speaker: "", flow: true,
    subject: (p) => `[PingMe] 【${p}】您的反馈状态已更新`
  },
  "收到新反馈": {
    title: "收到一条新反馈", speaker: "用户", flow: false,
    subject: (p) => `[PingMe] 【${p}】收到一条新反馈`
  },
  "用户补充了反馈": {
    title: "用户补充了反馈", speaker: "用户补充", flow: false,
    subject: (p) => `[PingMe] 【${p}】用户补充了反馈`
  }
};

const chip = (code, extra = "") => {
  const t = TONES[code];
  return `<span class="pm-chip pm-c-${code}" style="display:inline-block;padding:3px 11px;border-radius:999px;background-color:${t.bg};color:${t.fg};font-size:12px;line-height:20px;font-weight:600;white-space:nowrap${extra}">${t.label}</span>`;
};

// 进度条：四段，已走过的段为紫色，当前段名称加粗
const track = (code) => {
  const at = FLOW.indexOf(code);
  if (at < 0) return "";
  const cells = FLOW.map((k, i) => {
    const done = i <= at, now = i === at;
    return `<td width="25%" style="padding:0 ${i < 3 ? "4px" : "0"} 0 0;vertical-align:top">
<div class="${done ? "pm-bar-on" : "pm-bar"}" style="height:4px;border-radius:4px;background-color:${done ? C.accent : "rgba(23,24,31,.09)"};font-size:0;line-height:0">&nbsp;</div>
<div class="${now ? "pm-ink" : "pm-faint"}" style="padding-top:7px;font-size:12px;line-height:16px;color:${now ? C.ink : C.faint};font-weight:${now ? 700 : 400};white-space:nowrap">${TONES[k].label}</div></td>`;
  }).join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;table-layout:fixed"><tr>${cells}</tr></table>`;
};

const DEFAULT_LINKS = [
  { label: "个人主页", value: "mjh.im", href: "https://mjh.im" },
  { label: "越狱源", value: "apt.mjh.im", href: "https://apt.mjh.im" },
  { label: "TG 频道", value: "@junhongdev", href: "https://t.me/junhongdev" }
];

// 「关注更新」卡：项目官网单独一行，个人站点并排
const linksCard = (list) => {
  const primary = list.find((x) => x.primary), rest = list.filter((x) => !x.primary);
  const tile = (x) => `<a href="${escape(x.href)}" class="pm-tile-a" style="display:block;text-decoration:none;padding:12px 14px"><span class="pm-muted" style="display:block;font-size:11px;line-height:16px;color:${C.muted}">${escape(x.label)}</span><span class="pm-ink pm-tile-v" style="display:block;padding-top:2px;font-size:13px;line-height:19px;font-weight:600;color:${C.ink};word-break:break-all">${escape(x.value || x.href)}</span></a>`;
  const cell = "background-color:" + C.inner + ";border-radius:16px;box-shadow:inset 0 0 0 1px rgba(255,255,255,.75)";
  const top = primary ? `<tr><td colspan="${rest.length || 1}" style="padding:0 0 8px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:separate"><tr><td class="pm-tile" style="${cell}">
<a href="${escape(primary.href)}" style="display:block;text-decoration:none;padding:14px 16px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse"><tr>
<td><span class="pm-muted" style="display:block;font-size:11px;line-height:16px;color:${C.muted}">${escape(primary.label)}</span><span class="pm-ink" style="display:block;padding-top:2px;font-size:14px;line-height:20px;font-weight:700;color:${C.ink};overflow-wrap:anywhere">${escape(primary.value || primary.href)}</span></td>
<td align="right" style="white-space:nowrap;font-size:13px;line-height:20px;font-weight:600;color:${C.accent}" class="pm-link">访问 →</td></tr></table></a>
</td></tr></table></td></tr>` : "";
  const row = rest.length ? `<tr>${rest.map((x, i) => `<td width="${Math.floor(100 / rest.length)}%" style="padding:0 ${i < rest.length - 1 ? "8px" : "0"} 0 0;vertical-align:top"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:separate"><tr><td class="pm-tile" style="${cell}">${tile(x)}</td></tr></table></td>`).join("")}</tr>` : "";
  return `<div class="pm-ink" style="padding:0 2px 12px;font-size:13px;line-height:20px;font-weight:600;color:${C.ink}">关注更新</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;table-layout:fixed">${top}${row}</table>`;
};

export function renderFeedbackMail({ heading, projectName, number, status, previousStatus, statusCode, body = "", images = [], attachmentNote = "", link, admin = false, userEmail = "", preview = false, links }) {
  link = url(link);
  const scene = SCENES[heading] || SCENES["开发者回复了反馈"];
  const project = String(projectName || "PingMe");
  const subjectProject = Array.from(project.replace(/[\r\n]+/g, " ")).slice(0, 60).join("");
  const subject = scene.subject(subjectProject);

  const code = codeOf(statusCode, status);
  const changed = !!previousStatus && previousStatus !== status;
  const prevCode = changed ? codeOf("", previousStatus) : "";
  const transition = changed ? previousStatus + " → " + status : status;

  const isStatusOnly = !body;
  const content = body || (code === "closed"
    ? "开发者暂时不受理这条反馈。如果您有新的信息，回复这封邮件即可重新提交审核。"
    : "开发者已将这条反馈标记为“" + status + "”。感谢您花时间反馈！");
  const action = admin ? "在后台处理" : "查看反馈详情";
  const note = preview ? "演示邮件，未创建或修改反馈记录。" : "";
  // 只给用户的邮件带「关注更新」；没传 links 时用默认的个人站点
  const linkList = admin ? [] : (Array.isArray(links) ? links : DEFAULT_LINKS).filter((x) => x && x.href && x.label).map((x) => ({ ...x, href: url(x.href) })).slice(0, 4);

  // ---- 纯文本版 ----
  const text = [
    "pingme. · " + project,
    scene.title,
    "当前状态：" + status + (changed ? "（之前：" + previousStatus + "）" : ""),
    scene.lead || "",
    (scene.speaker ? scene.speaker + "：\n" : "") + content,
    images.length ? "图片请在邮件正文或反馈页面中查看。" : "",
    attachmentNote,
    admin && userEmail ? "用户邮箱：" + userEmail : "",
    admin && number ? "反馈编号：" + number : "",
    action + "：" + link,
    admin ? "直接回复此邮件即可答复用户。需同时更新状态时，在回复首行填写“状态：已完结”（可选：待审核、沟通中、待解决、不受理、已完结）。"
          : "如需补充信息或附件，直接回复此邮件，内容会追加到这条反馈。",
    linkList.length ? "关注更新：\n" + linkList.map((x) => x.label + "  " + x.href).join("\n") : "",
    admin ? "" : "这封邮件里有您的专属链接，请勿转发。",
    note
  ].filter(Boolean).join("\n\n");

  // ---- HTML ----
  const preheader = transition + " · " + content.replace(/\s+/g, " ").slice(0, 80);
  const spacer = "&#8199;&#65279;&#847; ".repeat(40);

  const imageRows = images.filter((image) => /^feedback-image-\d+$/.test(image.contentId)).map((image) => {
    const w = Math.min(image.width, 480);
    return `<tr><td style="padding:12px 0 0"><img src="cid:${image.contentId}" alt="反馈图片" width="${w}"${image.height && image.width <= 480 ? ` height="${image.height}"` : ""} class="pm-img" style="display:block;width:${w}px;max-width:100%;height:auto;max-height:640px;border:1px solid rgba(23,24,31,.08);border-radius:14px"></td></tr>`;
  }).join("");

  // 状态区：用户看进度条，管理员看状态标签
  const statusBlock = scene.flow && code !== "closed"
    ? `<tr><td style="padding:0 0 24px">${track(code)}</td></tr>`
    : `<tr><td style="padding:0 0 22px;font-size:12px;line-height:22px">${changed ? chip(prevCode, ";opacity:.6") + `<span class="pm-faint" style="color:${C.faint};padding:0 6px">→</span>` : ""}${chip(code)}</td></tr>`;

  // 正文块：一条消息，标注是谁说的
  const message = `<tr><td class="pm-inner" style="background-color:${C.inner};border-radius:20px;padding:18px 20px;box-shadow:inset 0 0 0 1px rgba(255,255,255,.75)">
${scene.speaker && !isStatusOnly ? `<div class="pm-muted" style="padding-bottom:8px;font-size:12px;line-height:18px;font-weight:600;color:${C.muted}">${escape(scene.speaker)}</div>` : ""}
<div class="pm-body" style="font-size:15px;line-height:26px;color:${C.body};overflow-wrap:anywhere;word-break:break-word">${lines(content)}</div>
${imageRows ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse">${imageRows}</table>` : ""}
${attachmentNote ? `<div class="pm-muted" style="padding-top:10px;font-size:12px;line-height:20px;color:${C.muted}">${escape(attachmentNote)}</div>` : ""}
</td></tr>`;

  const button = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate"><tr>
<td align="center" bgcolor="${C.accent}" style="background-color:${C.accent};border-radius:999px;box-shadow:inset 1px 1px 1px rgba(255,255,255,.45),inset -1px -1px 1px rgba(0,0,0,.12),0 8px 22px -8px ${C.accent}">
<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${escape(link)}" style="height:44px;v-text-anchor:middle;width:156px" arcsize="50%" stroke="f" fillcolor="${C.accent}"><center style="color:#ffffff;font-family:Arial,sans-serif;font-size:14px;font-weight:bold">${action}</center></v:roundrect><![endif]-->
<!--[if !mso]><!--><a href="${escape(link)}" style="display:inline-block;padding:11px 24px;font-size:14px;line-height:22px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:999px">${action}</a><!--<![endif]-->
</td></tr></table>`;

  // 第二张卡：怎么继续
  const row = (label, value) => `<tr><td class="pm-muted" style="padding:4px 14px 4px 0;font-size:13px;line-height:20px;color:${C.muted};white-space:nowrap;vertical-align:top">${label}</td><td class="pm-ink" style="padding:4px 0;font-size:13px;line-height:20px;color:${C.ink};word-break:break-all">${value}</td></tr>`;
  const statusChoices = ["new", "progress", "resolved", "closed", "completed"].map((k) => chip(k, ";margin:0 4px 6px 0")).join("");
  const helper = admin
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">
${userEmail ? row("用户邮箱", `<a href="mailto:${escape(encodeURIComponent(userEmail))}" class="pm-ink" style="color:${C.ink};text-decoration:none">${escape(userEmail)}</a>`) : ""}
${number ? row("反馈编号", `<span style="font-family:${MONO}">${escape(number)}</span>`) : ""}
${row("当前状态", escape(transition))}
</table>
<div class="pm-rule" style="margin:14px 0;border-top:1px solid ${C.line};font-size:0;line-height:0">&nbsp;</div>
<div class="pm-ink" style="font-size:13px;line-height:21px;color:${C.ink};font-weight:600">直接回复此邮件即可答复用户</div>
<div class="pm-muted" style="padding:4px 0 10px;font-size:13px;line-height:21px;color:${C.muted}">要同时改状态，在回复第一行写 <span class="pm-code" style="padding:1px 6px;border-radius:6px;background-color:${C.accentSoft};color:${C.accent};font-family:${MONO};font-size:12px">状态：已完结</span>，可选：</div>
<div style="line-height:28px">${statusChoices}</div>`
    : `<div class="pm-ink" style="font-size:13px;line-height:21px;color:${C.ink};font-weight:600">还有要补充的？</div>
<div class="pm-muted" style="padding-top:4px;font-size:13px;line-height:21px;color:${C.muted}">直接回复这封邮件，文字和附件都会追加到这条反馈，开发者会收到通知。</div>`;

  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><title>${escape(scene.title)}</title>
<style>
:root{color-scheme:light dark;supported-color-schemes:light dark}
@media (max-width:620px){.pm-outer{padding:14px 10px 28px!important}.pm-card{padding:24px 18px!important;border-radius:24px!important}.pm-title{font-size:23px!important;line-height:31px!important}.pm-inner{padding:16px!important}.pm-tile-a{padding:10px 8px!important}.pm-tile-v{font-size:12px!important;word-break:keep-all!important}}
@media (prefers-color-scheme:dark){
.pm-bg{background-color:#0c1018!important;background-image:radial-gradient(circle at 88% 0%,rgba(90,130,255,.30),rgba(90,130,255,0) 46%),radial-gradient(circle at 0% 72%,rgba(60,190,205,.22),rgba(60,190,205,0) 48%)!important}
.pm-glass{background-color:rgba(255,255,255,.07)!important;border-color:rgba(255,255,255,.12)!important;box-shadow:inset 1.5px 1.5px 1px rgba(255,255,255,.16),inset -1px -1px 1px rgba(255,255,255,.05),0 14px 34px -14px rgba(0,0,0,.6)!important}
.pm-inner,.pm-tile{background-color:rgba(255,255,255,.05)!important;border-color:rgba(255,255,255,.08)!important}
.pm-ink{color:#eceef4!important}.pm-body{color:#d6d9e2!important}.pm-muted{color:#a0a7b6!important}.pm-faint{color:#7c8495!important}
.pm-bar{background-color:rgba(255,255,255,.12)!important}.pm-bar-on{background-color:#8f82ff!important}
.pm-rule{border-color:rgba(255,255,255,.1)!important}.pm-img{border-color:rgba(255,255,255,.1)!important}
.pm-link{color:#b9b0ff!important}.pm-code{background-color:rgba(143,130,255,.18)!important;color:#b9b0ff!important}
.pm-c-new{color:#f5c56e!important}.pm-c-progress{color:#8cc0f2!important}.pm-c-resolved{color:#bdb3ff!important}.pm-c-closed{color:#b4bac4!important;background-color:rgba(255,255,255,.08)!important}.pm-c-completed{color:#86d4a6!important}
}
</style></head>
<body class="pm-bg" style="margin:0;padding:0;width:100%;background-color:${C.ground};color:${C.ink};font-family:${FONT};-webkit-text-size-adjust:100%">
<div style="display:none!important;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px">${escape(preheader)}${spacer}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.ground}" class="pm-bg" style="width:100%;border-collapse:collapse;background-color:${C.ground};background-image:${BLOBS}"><tr><td align="center" class="pm-outer" style="padding:28px 16px 40px">
<!--[if mso]><table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;border-collapse:separate;text-align:left">

<tr><td class="pm-glass" style="border-radius:999px;padding:11px 20px;${GLASS}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse"><tr>
<td class="pm-ink" style="padding:0;font-size:17px;line-height:22px;font-weight:800;letter-spacing:-.02em;color:${C.ink}">pingme<span style="color:${C.accent}">.</span></td>
<td align="right" class="pm-muted" style="padding:0 0 0 12px;font-size:13px;line-height:22px;color:${C.muted};max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escape(project)}</td>
</tr></table>
</td></tr>
<tr><td style="height:14px;font-size:0;line-height:0">&nbsp;</td></tr>
<tr><td class="pm-glass pm-card" style="border-radius:30px;padding:32px 32px 30px;word-break:break-word;${GLASS}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:separate">
<tr><td style="padding:0 0 ${scene.lead ? "10px" : "18px"}"><h1 class="pm-title pm-ink" style="margin:0;font-size:26px;line-height:34px;font-weight:800;letter-spacing:-.01em;color:${C.ink}">${escape(scene.title)}</h1></td></tr>
${scene.lead ? `<tr><td class="pm-muted" style="padding:0 0 20px;font-size:14px;line-height:23px;color:${C.muted}">${escape(scene.lead)}</td></tr>` : ""}
${statusBlock}
${message}
<tr><td style="padding:24px 0 0">${button}</td></tr>
</table>
</td></tr>

<tr><td style="height:14px;font-size:0;line-height:0">&nbsp;</td></tr>
<tr><td class="pm-glass" style="border-radius:24px;padding:20px 24px;word-break:break-word;${GLASS}">${helper}</td></tr>

${linkList.length ? `<tr><td style="height:14px;font-size:0;line-height:0">&nbsp;</td></tr><tr><td class="pm-glass" style="border-radius:24px;padding:18px;${GLASS}">${linksCard(linkList)}</td></tr>` : ""}

<tr><td class="pm-faint" align="center" style="padding:20px 8px 0;font-size:11px;line-height:18px;color:${C.faint}">${admin ? "PingMe 管理通知 · 仅发送给项目管理员" : "这封邮件里有您的专属链接，请勿转发"} · pingme.pm${note ? "<br>" + escape(note) : ""}</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>`;
  return { subject, text, html };
}
