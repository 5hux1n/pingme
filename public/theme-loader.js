// 主题加载：index.html 头部的小脚本先按浏览器缓存的主题插入样式（不闪烁），
// 这里再向 /api/theme 确认当前主题，有变化就更新缓存并换上对应文件。
// 地址后加 ?theme=<id> 只预览该主题，不保存、不影响其他访客。
// 后台保存外观后调用 window.pingmeTheme.set()，当前页面立即换装。

const KEY = 'pingme:theme';
const SAFE = /^\/themes\/[a-z0-9-]+\/[a-z0-9.-]+\.(?:css|js)(?:\?v=[A-Za-z0-9.-]+)?$/;
const DEFAULT = { id: 'default', themeColor: '#ffffff', css: [], adminCss: [], js: [] };
const importedJs = new Set();

function valid(t) {
  if (!t || typeof t.id !== 'string') return null;
  const list = v => (Array.isArray(v) ? v.filter(h => typeof h === 'string' && SAFE.test(h)) : []);
  return { id: t.id, themeColor: /^#[0-9a-f]{6}$/i.test(t.themeColor) ? t.themeColor : '#ffffff', css: list(t.css), adminCss: list(t.adminCss), js: list(t.js) };
}
function readCache() { try { return valid(JSON.parse(localStorage.getItem(KEY))); } catch { return null; } }
function writeCache(t) { try { localStorage.setItem(KEY, JSON.stringify(t)); } catch {} }
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// 主题的后台样式必须排在 admin.css 后面；admin.css 是后台打开时才插入的
// 只在主题样式排到了 admin.css 前面时才移动，避免移动本身再次触发观察器
function keepAdminLast() {
  const base = document.getElementById('adminStyles');
  if (!base) return;
  document.querySelectorAll('link[data-theme-admin]').forEach(l => {
    if (base.compareDocumentPosition(l) & Node.DOCUMENT_POSITION_PRECEDING) document.head.append(l);
  });
}
new MutationObserver(keepAdminLast).observe(document.head, { childList: true });

function link(href, admin) {
  const existing = document.querySelector(`link[data-theme-asset][href="${CSS.escape(href)}"]`);
  if (existing) return Promise.resolve();
  const l = document.createElement('link');
  l.rel = 'stylesheet'; l.href = href; l.dataset.themeAsset = '';
  if (admin) l.dataset.themeAdmin = '';
  document.head.append(l);
  return new Promise(done => { l.onload = l.onerror = done; setTimeout(done, 3000); });
}

// 换上主题；如果要撤掉已经运行的主题脚本，返回 true，调用方刷新页面
function apply(t) {
  const wanted = new Set([...t.css, ...t.adminCss]);
  document.querySelectorAll('link[data-theme-asset]').forEach(l => { if (!wanted.has(l.getAttribute('href'))) l.remove(); });
  const loads = [...t.css.map(h => link(h, false)), ...t.adminCss.map(h => link(h, true))];
  keepAdminLast();
  const stale = [...importedJs].some(src => !t.js.includes(src));
  for (const src of t.js) if (!importedJs.has(src)) { importedJs.add(src); import(src).catch(() => {}); }
  document.documentElement.dataset.siteTheme = t.id;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t.themeColor);
  return { ready: Promise.all(loads), stale };
}

async function fetchTheme(preview) {
  const r = await fetch('/api/theme' + (preview ? '?preview=' + encodeURIComponent(preview) : ''), { credentials: 'same-origin', signal: AbortSignal.timeout(4000) });
  if (!r.ok) throw Error('theme unavailable');
  return valid((await r.json()).theme);
}

let preview = '';
try { preview = new URLSearchParams(location.search).get('theme') || ''; } catch {}
if (!/^[a-z0-9-]{1,40}$/.test(preview)) preview = '';

const cached = readCache();
let current = cached || DEFAULT;
if (cached && !preview) apply(cached);

// app.js 首次渲染前等主题就位（最多 1.5 秒），有缓存时立即放行
const confirmed = (async () => {
  try {
    const fresh = await fetchTheme(preview);
    if (!fresh) return;
    if (!preview) {
      if (!cached || !same(fresh, cached)) writeCache(fresh);
      if (same(fresh, current)) return;
    }
    const { ready, stale } = apply(fresh);
    current = fresh;
    if (stale) { location.reload(); return new Promise(() => {}); }
    await ready;
  } catch {}
})();
window.pingmeThemeReady = cached && !preview ? Promise.resolve() : Promise.race([confirmed, new Promise(r => setTimeout(r, 1500))]);

window.pingmeTheme = {
  get current() { return current.id; },
  // 后台保存后调用：更新缓存并立即换装
  set(assets) {
    const t = valid(assets);
    if (!t) return;
    writeCache(t);
    const { stale } = apply(t);
    current = t;
    if (stale) location.reload();
  }
};
