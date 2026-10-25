// 液态玻璃：画背景；在支持的浏览器里给主要玻璃面加上真实的边缘折射。
// 只加外观，不碰页面逻辑。页面由 app.js / admin.js 动态渲染，这里用 MutationObserver 跟上。
// 作为主题脚本由 theme-loader.js 按需加载。

const SVGNS = 'http://www.w3.org/2000/svg';
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- 背景 ---------- */
// 四种背景，WALL 决定用哪种；预览时可以在地址后面加 ?wall=discs / dots / glow / word 临时切换
const WALL = 'glow';
const WALLS = {
  // 几块大的半透明实心圆，互相叠一点
  discs: () => '<span class="disc disc--a"></span><span class="disc disc--b"></span><span class="disc disc--c"></span><span class="disc disc--d"></span>',
  // 大小不一的紫色圆点，像气泡；位置固定，每次打开都一样
  dots: () => {
    const spots = [[88, 9, 7], [72, 26, 3.2], [94, 42, 4.5], [8, 78, 6], [22, 90, 2.6], [58, 72, 2.2], [40, 14, 1.6], [14, 34, 2.4], [80, 86, 3.4], [50, 46, 1.4]];
    return spots.map(([x, y, r], i) => `<span class="dot" style="left:${x}%;top:${y}%;width:${r * 2}vmax;height:${r * 2}vmax;--o:${(0.5 + (i % 3) * 0.18).toFixed(2)}"></span>`).join('');
  },
  // 只留两团柔光
  glow: () => '',
  // 巨大的淡色字标
  word: () => '<span class="word">pingme<i>.</i></span>'
};

function wall() {
  if (document.querySelector('.pm-wall')) return;
  let kind = WALL;
  try { const q = new URLSearchParams(location.search).get('wall'); if (q && WALLS[q]) kind = q; } catch {}
  const box = document.createElement('div');
  box.className = 'pm-wall pm-wall--' + kind;
  box.setAttribute('aria-hidden', 'true');
  box.innerHTML = '<span class="pm-wall__glow pm-wall__glow--a"></span><span class="pm-wall__glow pm-wall__glow--b"></span>' + WALLS[kind]();
  document.body.prepend(box);
}

/* ---------- 折射 ---------- */
// 主要的阅读面和导航才加折射，卡片之类保持 CSS 毛玻璃，避免太多滤镜拖慢页面
const LENS = '.nav, .formbody, .contentbox, .center.fade, .personal-profile, .a-top, .a-auth main';
const THICK = '.formbody, .contentbox, .center.fade, .personal-profile, .a-auth main';
const canLens = () => /Chrome\//.test(navigator.userAgent) && CSS.supports('backdrop-filter', 'url(#a) blur(1px)');
let defs, uid = 0;
const lenses = new Map();

// R 通道 = 水平位移，G 通道 = 垂直位移，128 不动；越靠近边缘越往里推，像透镜的厚边
function mapFor(w, h, r, band) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h), d = img.data;
  r = Math.min(r, w / 2, h / 2);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const qx = Math.max(r - x, 0, x - (w - 1 - r)), qy = Math.max(r - y, 0, y - (h - 1 - r));
      let dist, nx = 0, ny = 0;
      if (qx > 0 && qy > 0) {
        const len = Math.hypot(qx, qy) || 1;
        dist = r - len; nx = (x < w / 2 ? 1 : -1) * qx / len; ny = (y < h / 2 ? 1 : -1) * qy / len;
      } else {
        const dl = x, dr = w - 1 - x, dt = y, db = h - 1 - y;
        dist = Math.min(dl, dr, dt, db);
        if (dist === dl) nx = 1; else if (dist === dr) nx = -1; else if (dist === dt) ny = 1; else ny = -1;
      }
      const t = Math.max(0, 1 - dist / band), k = t * t * (3 - 2 * t), i = (y * w + x) * 4;
      d[i] = 128 + nx * k * 127; d[i + 1] = 128 + ny * k * 127; d[i + 2] = 128; d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL();
}

function attach(node) {
  if (lenses.has(node)) return;
  const id = 'pm-lens-' + (++uid);
  const filter = document.createElementNS(SVGNS, 'filter');
  for (const [k, v] of Object.entries({ id, x: '0', y: '0', width: '100%', height: '100%', 'color-interpolation-filters': 'sRGB' })) filter.setAttribute(k, v);
  const image = document.createElementNS(SVGNS, 'feImage');
  image.setAttribute('result', 'map'); image.setAttribute('preserveAspectRatio', 'none');
  const blur = document.createElementNS(SVGNS, 'feGaussianBlur');
  blur.setAttribute('in', 'SourceGraphic'); blur.setAttribute('stdDeviation', node.matches(THICK) ? '9' : '2'); blur.setAttribute('result', 'soft');
  const disp = document.createElementNS(SVGNS, 'feDisplacementMap');
  for (const [k, v] of Object.entries({ in: 'soft', in2: 'map', xChannelSelector: 'R', yChannelSelector: 'G' })) disp.setAttribute(k, v);
  filter.append(image, blur, disp);
  defs.append(filter);
  let last = '', frame = 0;
  const paint = () => {
    frame = 0;
    const w = Math.round(node.offsetWidth), h = Math.round(node.offsetHeight);
    if (!w || !h || w * h > 1600000) return; // 过大的面不做折射
    const r = parseFloat(getComputedStyle(node).borderTopLeftRadius) || 0, key = w + 'x' + h + 'r' + r;
    if (key === last) return;
    last = key;
    const band = Math.min(24, h / 2.5);
    image.setAttribute('width', w); image.setAttribute('height', h);
    image.setAttribute('href', mapFor(w, h, r, band));
    disp.setAttribute('scale', String(Math.round(band * 1.5)));
    node.style.setProperty('--lens', `url(#${id})`);
    node.classList.add('pm-lens');
  };
  const ro = new ResizeObserver(() => { if (!frame) frame = requestAnimationFrame(paint); });
  ro.observe(node);
  lenses.set(node, { filter, ro });
}

function sweep() {
  for (const [node, l] of lenses) if (!node.isConnected) { l.ro.disconnect(); l.filter.remove(); lenses.delete(node); }
  document.querySelectorAll(LENS).forEach(attach);
}

function start() {
  wall();
  if (!canLens() || reduced) return;
  const svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('width', '0'); svg.setAttribute('height', '0'); svg.setAttribute('aria-hidden', 'true');
  svg.style.cssText = 'position:absolute;width:0;height:0';
  defs = document.createElementNS(SVGNS, 'defs');
  svg.append(defs);
  document.body.append(svg);
  let queued = false;
  new MutationObserver(() => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; sweep(); }); } })
    .observe(document.getElementById('app') || document.body, { childList: true, subtree: true });
  sweep();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
