CREATE TABLE IF NOT EXISTS projects (
 id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
 official_url TEXT NOT NULL DEFAULT '',
 description TEXT NOT NULL DEFAULT '', color TEXT NOT NULL DEFAULT '#6b62d9', icon TEXT NOT NULL DEFAULT '◈',
 visible INTEGER NOT NULL DEFAULT 1, enabled INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS tickets (
 id TEXT PRIMARY KEY, number TEXT NOT NULL UNIQUE, project_id TEXT NOT NULL,
 kind TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL,
 app_version TEXT NOT NULL DEFAULT '', platform TEXT NOT NULL DEFAULT '', contact TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'new', access_hash TEXT NOT NULL UNIQUE,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(project_id) REFERENCES projects(id)
);
CREATE INDEX IF NOT EXISTS idx_tickets_project ON tickets(project_id,created_at);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status,created_at);
CREATE TABLE IF NOT EXISTS messages (
 id TEXT PRIMARY KEY, ticket_id TEXT NOT NULL, role TEXT NOT NULL, body TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(ticket_id) REFERENCES tickets(id)
);
CREATE INDEX IF NOT EXISTS idx_messages_ticket ON messages(ticket_id,created_at);
CREATE TABLE IF NOT EXISTS attachments (
 id TEXT PRIMARY KEY, ticket_id TEXT NOT NULL, message_id TEXT,
 name TEXT NOT NULL, mime TEXT NOT NULL, bytes INTEGER NOT NULL, object_key TEXT NOT NULL UNIQUE,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(ticket_id) REFERENCES tickets(id)
);
CREATE INDEX IF NOT EXISTS idx_attachments_ticket ON attachments(ticket_id);
CREATE TABLE IF NOT EXISTS rate_limits (
 bucket TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL
);
-- Project names and descriptions from https://mjh.im on 2026-10-11.
-- Preserve existing IDs, feedback, visibility and enabled settings.
INSERT INTO projects(id,slug,name,description,color,icon) VALUES('fakenotify','fakenotify','FakeNotify','iOS 原生模拟推送通知插件','#6c5be9','F') ON CONFLICT(slug) DO UPDATE SET name=excluded.name,description=excluded.description;
INSERT INTO projects(id,slug,name,description,color,icon) VALUES('fanqie','fanqie','番茄净化','番茄小说自定义 App 插件','#6c5be9','番') ON CONFLICT(slug) DO UPDATE SET name=excluded.name,description=excluded.description;
INSERT INTO projects(id,slug,name,description,color,icon) VALUES('hongguo','hongguo','红果净化','红果短剧的自定义 App 插件','#6c5be9','红') ON CONFLICT(slug) DO UPDATE SET name=excluded.name,description=excluded.description;
INSERT INTO projects(id,slug,name,description,color,icon) VALUES('xianyu','xianyu','闲鱼助手','闲鱼去广告、自动化助手','#6c5be9','闲') ON CONFLICT(slug) DO UPDATE SET name=excluded.name,description=excluded.description;
INSERT INTO projects(id,slug,name,description,color,icon) VALUES('fakeperm','fakeperm','虚拟权限','32种手机系统权限管理插件','#6c5be9','虚') ON CONFLICT(slug) DO UPDATE SET name=excluded.name,description=excluded.description;
INSERT INTO projects(id,slug,name,description,color,icon) VALUES('wclocate','wclocate','WcLocate','微信修改定位插件','#6c5be9','W') ON CONFLICT(slug) DO UPDATE SET name=excluded.name,description=excluded.description;
INSERT INTO projects(id,slug,name,description,color,icon) VALUES('danmu','danmu','弹幕助手','主流直播平台的快捷发送弹幕工具','#6c5be9','弹') ON CONFLICT(slug) DO UPDATE SET name=excluded.name,description=excluded.description;
INSERT INTO projects(id,slug,name,description,color,icon) VALUES('alipay2nfc','alipay2nfc','Alipay2NFC','多开支付宝的碰一碰跳转工具。','#6c5be9','A') ON CONFLICT(slug) DO UPDATE SET name=excluded.name,description=excluded.description;
INSERT INTO projects(id,slug,name,description,color,icon) VALUES('pingme','pingme','PingMe','项目反馈统一入口','#6c5be9','P') ON CONFLICT(slug) DO UPDATE SET name=excluded.name,description=excluded.description;
INSERT INTO projects(id,slug,name,description,color,icon) VALUES('scratch','scratch','挠一挠','云挠痒痒','#6c5be9','挠') ON CONFLICT(slug) DO UPDATE SET name=excluded.name,description=excluded.description;
INSERT INTO projects(id,slug,name,description,color,icon) VALUES('domaincheck','domaincheck','DomainCheck','域名注册状态查询工具','#6c5be9','D') ON CONFLICT(slug) DO UPDATE SET name=excluded.name,description=excluded.description;
INSERT INTO projects(id,slug,name,description,color,icon) VALUES('goforit','goforit','GoForIt.si','Ai 时代，想做就做！','#6c5be9','G') ON CONFLICT(slug) DO UPDATE SET name=excluded.name,description=excluded.description;
INSERT INTO projects(id,slug,name,description,color,icon) VALUES('nsaa','nsaa','NoShakeAds.com','把广告选择权还给用户','#6c5be9','N') ON CONFLICT(slug) DO UPDATE SET name=excluded.name,description=excluded.description;
INSERT INTO projects(id,slug,name,description,color,icon) VALUES('relaxin','relaxin','Relaxin.dev','Relaxin 越狱镜像站','#6c5be9','R') ON CONFLICT(slug) DO UPDATE SET name=excluded.name,description=excluded.description;
INSERT INTO projects(id,slug,name,description,color,icon) VALUES('resetit','resetit','ResetIt.lol','When Codex Reset？','#6c5be9','R') ON CONFLICT(slug) DO UPDATE SET name=excluded.name,description=excluded.description;
INSERT INTO projects(id,slug,name,description,color,icon) VALUES('isbaby','isbaby','Is.baby','测测你是哪种 Baby','#6c5be9','I') ON CONFLICT(slug) DO UPDATE SET name=excluded.name,description=excluded.description;
INSERT INTO projects(id,slug,name,description,color,icon) VALUES('tengzhou','tengzhou','Tengzhou.ren','把滕州人连成一张网','#6c5be9','T') ON CONFLICT(slug) DO UPDATE SET name=excluded.name,description=excluded.description;
INSERT INTO projects(id,slug,name,description,color,icon) VALUES('return-shot','return-shot','网购退货截图生成器','','#6c5be9','网') ON CONFLICT(slug) DO UPDATE SET name=excluded.name,description=excluded.description;
INSERT INTO projects(id,slug,name,description,color,icon) VALUES('cc','cc','CC 你又想挨揍了','','#6c5be9','C') ON CONFLICT(slug) DO UPDATE SET name=excluded.name,description=excluded.description;
INSERT INTO projects(id,slug,name,description,color,icon) VALUES('guzi','guzi','抢谷子','','#6c5be9','抢') ON CONFLICT(slug) DO UPDATE SET name=excluded.name,description=excluded.description;
INSERT INTO projects(id,slug,name,description,color,icon) VALUES('obplayer','obplayer','OBPlayer','无延迟直播流播放器','#6c5be9','O') ON CONFLICT(slug) DO UPDATE SET name=excluded.name,description=excluded.description;
INSERT INTO projects(id,slug,name,description,color,icon) VALUES('ffcell','ffcell','方方格子离线登录授权','','#6c5be9','方') ON CONFLICT(slug) DO UPDATE SET name=excluded.name,description=excluded.description;
INSERT INTO projects(id,slug,name,description,color,icon) VALUES('catchcat','catchcat','抓小猫','','#6c5be9','抓') ON CONFLICT(slug) DO UPDATE SET name=excluded.name,description=excluded.description;
INSERT INTO projects(id,slug,name,description,color,icon) VALUES('cherrymac','cherrymac','CherryMac','Mac 和 Web 版樱桃键盘管理工具','#6c5be9','C') ON CONFLICT(slug) DO UPDATE SET name=excluded.name,description=excluded.description;
INSERT INTO projects(id,slug,name,description,color,icon) VALUES('nsimg','nsimg','NSImg 助手','NodeSeek 论坛的图床插件','#6c5be9','N') ON CONFLICT(slug) DO UPDATE SET name=excluded.name,description=excluded.description;
INSERT INTO projects(id,slug,name,description,color,icon) VALUES('codexm','codexm','CodexM','多ChatGPT 账号运行程序','#6c5be9','C') ON CONFLICT(slug) DO UPDATE SET name=excluded.name,description=excluded.description;
INSERT INTO projects(id,slug,name,description,color,icon) VALUES('shuxin','shuxin','ShuXin（书信）','可自托管的个人微博客','#6c5be9','S') ON CONFLICT(slug) DO UPDATE SET name=excluded.name,description=excluded.description;
INSERT INTO projects(id,slug,name,description,color,icon) VALUES('m04s','m04s','印先森 M04S','网页蓝牙打印 · Mac 驱动','#6c5be9','印') ON CONFLICT(slug) DO UPDATE SET name=excluded.name,description=excluded.description;
INSERT INTO projects(id,slug,name,description,color,icon) VALUES('wcsy','wcsy','WcSy','微信情景分析插件 · 实验中','#6c5be9','W') ON CONFLICT(slug) DO UPDATE SET name=excluded.name,description=excluded.description;
INSERT INTO projects(id,slug,name,description,color,icon) VALUES('silex','silex','Silex','部署属于你自己的越狱源','#6c5be9','S') ON CONFLICT(slug) DO UPDATE SET name=excluded.name,description=excluded.description;
INSERT INTO projects(id,slug,name,description,color,icon) VALUES('apush','apush','APush','统一推送管理分流规则项目','#6c5be9','A') ON CONFLICT(slug) DO UPDATE SET name=excluded.name,description=excluded.description;
INSERT INTO projects(id,slug,name,description,color,icon) VALUES('pdd-ship-bot','pdd-ship-bot','PddShipBot','拼多多商家发货 api 助手','#6c5be9','P') ON CONFLICT(slug) DO UPDATE SET name=excluded.name,description=excluded.description;
INSERT INTO projects(id,slug,name,description,color,icon) VALUES('soleprop-calc','soleprop-calc','个体户税费计算器','一款开源微信小程序','#6c5be9','个') ON CONFLICT(slug) DO UPDATE SET name=excluded.name,description=excluded.description;
UPDATE projects SET official_url='https://fakenotify.goforit.si/' WHERE slug='fakenotify';
UPDATE projects SET official_url='https://fanqie.goforit.si/' WHERE slug='fanqie';
UPDATE projects SET official_url='https://hongguo.goforit.si/' WHERE slug='hongguo';
UPDATE projects SET official_url='https://xianyu.goforit.si/' WHERE slug='xianyu';
UPDATE projects SET official_url='https://xnqx.goforit.si/' WHERE slug='fakeperm';
UPDATE projects SET official_url='https://apt.mjh.im/depiction/web/im.mjh.wclocate.html' WHERE slug='wclocate';
UPDATE projects SET official_url='https://dmzs.goforit.si/' WHERE slug='danmu';
UPDATE projects SET official_url='https://apt.mjh.im/depiction/web/im.mjh.alipay2nfc.html' WHERE slug='alipay2nfc';
UPDATE projects SET official_url='https://pingme.pm/' WHERE slug='pingme';
UPDATE projects SET official_url='https://nao.goforit.si/' WHERE slug='scratch';
UPDATE projects SET official_url='https://domain.goforit.si/' WHERE slug='domaincheck';
UPDATE projects SET official_url='https://goforit.si/' WHERE slug='goforit';
UPDATE projects SET official_url='https://noshakeads.com' WHERE slug='nsaa';
UPDATE projects SET official_url='https://relaxin.dev' WHERE slug='relaxin';
UPDATE projects SET official_url='https://resetit.lol' WHERE slug='resetit';
UPDATE projects SET official_url='https://is.baby' WHERE slug='isbaby';
UPDATE projects SET official_url='https://tengzhou.ren' WHERE slug='tengzhou';
UPDATE projects SET official_url='https://obplayer.goforit.si/' WHERE slug='obplayer';
UPDATE projects SET official_url='https://cherrymac.goforit.si/' WHERE slug='cherrymac';
UPDATE projects SET official_url='https://nsimg.goforit.si/' WHERE slug='nsimg';
UPDATE projects SET official_url='https://codexm.goforit.si/' WHERE slug='codexm';
UPDATE projects SET official_url='https://shuxin.goforit.si/' WHERE slug='shuxin';
UPDATE projects SET official_url='https://bleprint.goforit.si/' WHERE slug='m04s';
UPDATE projects SET official_url='https://wcsy.goforit.si/' WHERE slug='wcsy';
UPDATE projects SET official_url='https://github.com/5hux1n/Silex' WHERE slug='silex';
UPDATE projects SET official_url='https://apush.cn/' WHERE slug='apush';
UPDATE projects SET official_url='https://github.com/5hux1n/pdd-ship-bot' WHERE slug='pdd-ship-bot';
UPDATE projects SET official_url='https://github.com/5hux1n/SolePropYearEndCalc' WHERE slug='soleprop-calc';

CREATE TABLE IF NOT EXISTS admin_credentials (
 id TEXT PRIMARY KEY CHECK(id='admin'),
 password_hash TEXT NOT NULL, salt TEXT NOT NULL, iterations INTEGER NOT NULL,
 session_version TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
