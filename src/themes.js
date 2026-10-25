// 站点主题。每个主题是叠在原版样式上的一组文件，放在 public/themes/<id>/ 里。
// 原版（default）不加载任何主题文件。新增主题：在 THEMES 里加一项，并放好对应文件。
// 当前主题保存在 site_settings 的 theme 键里，后台「外观」页切换，立即生效，不需要重新部署。

export const DEFAULT_THEME = 'default';

export const THEMES = [
  { id: 'default', name: '原版', description: '白底、细边框卡片，PingMe 最初的样式。', swatch: ['#ffffff', '#f5f5f5', '#262626'], themeColor: '#ffffff', css: [], adminCss: [], js: [] },
  {
    id: 'glass', name: '液态玻璃', description: '天蓝和冰青柔光的背景，导航和面板是浮起来的玻璃，主按钮用品牌紫。',
    swatch: ['#eff4f8', '#9ccaff', '#6c5be9'], themeColor: '#eff4f8',
    css: ['/themes/glass/site.css?v=20261025-1'],
    adminCss: ['/themes/glass/admin.css?v=20261026-1'],
    js: ['/themes/glass/theme.js?v=20261025-1']
  }
];

const byId = new Map(THEMES.map(t => [t.id, t]));

export function isTheme(id) { return byId.has(id); }

// 公开接口只返回加载主题需要的信息
export function themeAssets(id) {
  const t = byId.get(id) || byId.get(DEFAULT_THEME);
  return { id: t.id, themeColor: t.themeColor, css: t.css, adminCss: t.adminCss, js: t.js };
}

// 后台用：主题列表（不含文件路径）
export function themeChoices() {
  return THEMES.map(({ id, name, description, swatch }) => ({ id, name, description, swatch }));
}

export async function readTheme(env) {
  const row = await env.DB.prepare("SELECT value,version FROM site_settings WHERE key='theme'").first();
  let id = DEFAULT_THEME;
  if (row) { try { const saved = JSON.parse(row.value).id; if (isTheme(saved)) id = saved; } catch {} }
  return { id, version: row?.version || 0 };
}

// 原子版本检查：version 为 0 表示首次保存
export async function saveTheme(env, id, version) {
  const value = JSON.stringify({ id });
  const result = version === 0
    ? await env.DB.prepare("INSERT OR IGNORE INTO site_settings(key,value,version) VALUES('theme',?,1)").bind(value).run()
    : await env.DB.prepare("UPDATE site_settings SET value=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE key='theme' AND version=?").bind(value, version).run();
  return result.meta.changes > 0;
}
