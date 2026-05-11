const express = require('express');
const axios = require('axios');
const path = require('path');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 3000;

// 获取本机局域网 IP
function getLanIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

// ---------------------------------------------------------------------------
// 关键: 使用抖音 APP 的 User-Agent 才能绕过反爬拿到真实数据
// ---------------------------------------------------------------------------
const MOBILE_UA =
  'com.ss.android.ugc.aweme/800 (Linux; U; Android 8.0; zh_CN; Nexus 6P; Build/OPM1.171019.011)';

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

// ---------------------------------------------------------------------------
// 从分享链接获取页面跳转目标 URL
// ---------------------------------------------------------------------------
async function resolveRedirect(url) {
  const resp = await axios.get(url, {
    headers: {
      'User-Agent': MOBILE_UA,
      'Accept-Language': 'zh-CN,zh;q=0.9',
    },
    maxRedirects: 0,
    validateStatus: (s) => s === 301 || s === 302,
    timeout: 10000,
  });
  return resp.headers['location'] || '';
}

// ---------------------------------------------------------------------------
// 获取视频页面 HTML (用 APP UA 绕过验证码)
// ---------------------------------------------------------------------------
async function fetchVideoPage(pageUrl) {
  const resp = await axios.get(pageUrl, {
    headers: {
      'User-Agent': MOBILE_UA,
      'Accept-Language': 'zh-CN,zh;q=0.9',
    },
    timeout: 15000,
    maxRedirects: 5,
  });
  return resp.data;
}

// ---------------------------------------------------------------------------
// 从 HTML 中提取视频数据
// ---------------------------------------------------------------------------
function parseVideoFromHtml(html) {
  // 提取 play_addr.uri (即真正的 video_id)
  const uriMatch = html.match(/"play_addr"\s*:\s*\{[^}]*"uri"\s*:\s*"([^"]+)"/);
  const videoId = uriMatch ? uriMatch[1] : '';

  // 提取视频描述
  const descMatch = html.match(/"desc"\s*:\s*"([^"]+)"/);
  const desc = descMatch
    ? descMatch[1].replace(/\\u002F/g, '/').replace(/\\"/g, '"')
    : '';

  // 提取作者昵称 — 找到 item_list 后的第一个 nickname
  const nickMatch = html.match(/"nickname"\s*:\s*"([^"]+)"/);
  const author = nickMatch ? nickMatch[1] : '';

  // 提取封面图 (这是视频封面，不是头像)
  const coverMatch = html.match(/"cover"\s*:\s*\{[^}]*"url_list"\s*:\s*\["([^"]+)"/);
  let coverUrl = coverMatch ? coverMatch[1] : '';
  // / 转 /
  coverUrl = coverUrl.replace(/\\u002F/g, '/');

  // 如果没找到 cover，尝试 origin_cover
  if (!coverUrl) {
    const ocMatch = html.match(/"origin_cover"\s*:\s*\{[^}]*"url_list"\s*:\s*\["([^"]+)"/);
    if (ocMatch) {
      coverUrl = ocMatch[1].replace(/\\u002F/g, '/');
    }
  }

  // 提取动态封面
  if (!coverUrl) {
    const dcMatch = html.match(/"dynamic_cover"\s*:\s*\{[^}]*"url_list"\s*:\s*\["([^"]+)"/);
    if (dcMatch) {
      coverUrl = dcMatch[1].replace(/\\u002F/g, '/');
    }
  }

  return { videoId, desc, author, coverUrl };
}

// ---------------------------------------------------------------------------
// 从任意抖音链接提取 aweme_id
// ---------------------------------------------------------------------------
function extractAwemeId(url) {
  // 视频/图文页面
  const m1 = url.match(/douyin\.com\/(?:video|note)\/(\d{17,19})/);
  if (m1) return m1[1];

  // 分享页
  const m2 = url.match(/douyin\.com\/share\/(?:video|note)\/(\d{17,19})/);
  if (m2) return m2[1];

  // 19 位数字 ID
  const m3 = url.match(/(\d{17,19})/);
  if (m3) return m3[1];

  return '';
}

// ---------------------------------------------------------------------------
// API: 解析抖音视频链接
// ---------------------------------------------------------------------------
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/parse', async (req, res) => {
  try {
    const inputUrl = (req.body.url || '').trim();
    if (!inputUrl) {
      return res.json({ success: false, error: '请输入抖音分享链接' });
    }

    let pageUrl = inputUrl;

    // 第一步: 如果是短链接，跟随跳转获取真实页面地址
    if (/v\.douyin\.com/i.test(inputUrl)) {
      try {
        const location = await resolveRedirect(inputUrl);
        if (location) pageUrl = location;
      } catch (e) {
        return res.json({ success: false, error: '无法解析分享链接，请检查链接是否正确' });
      }
    }

    // 第二步: 获取视频页面 HTML
    let html;
    try {
      html = await fetchVideoPage(pageUrl);
    } catch (e) {
      return res.json({ success: false, error: '获取视频信息失败，请稍后重试' });
    }

    if (!html || html.length < 1000) {
      return res.json({ success: false, error: '获取视频页面失败' });
    }

    // 第三步: 解析视频数据
    const info = parseVideoFromHtml(html);

    if (!info.videoId) {
      return res.json({ success: false, error: '无法解析视频数据，抖音页面可能已更新' });
    }

    // 第四步: 构造无水印播放地址
    // playwm = 带水印, play = 无水印
    const videoUrl = `https://aweme.snssdk.com/aweme/v1/play/?video_id=${info.videoId}&ratio=1080p&line=0`;

    res.json({
      success: true,
      data: {
        video_url: videoUrl,
        cover_url: info.coverUrl,
        author: info.author,
        desc: info.desc || '抖音视频',
        ext: 'mp4',
      },
    });
  } catch (err) {
    res.json({ success: false, error: '服务器错误，请稍后重试' });
  }
});

// ---------------------------------------------------------------------------
// API: 代理下载视频 (解决 CDN 跨域问题)
// ---------------------------------------------------------------------------
app.get('/api/download', async (req, res) => {
  const { url, ext } = req.query;
  if (!url) return res.status(400).send('缺少视频地址');

  try {
    const resp = await axios({
      method: 'GET',
      url: decodeURIComponent(url),
      responseType: 'stream',
      timeout: 60000,
      headers: {
        'User-Agent': MOBILE_UA,
        Referer: 'https://www.douyin.com/',
      },
    });

    const filename = `douyin_${Date.now()}.${ext || 'mp4'}`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', resp.headers['content-type'] || 'video/mp4');
    if (resp.headers['content-length']) {
      res.setHeader('Content-Length', resp.headers['content-length']);
    }
    resp.data.pipe(res);
  } catch (err) {
    res.status(500).send('视频下载失败，可能链接已过期');
  }
});

// ---------------------------------------------------------------------------
// 启动
// ---------------------------------------------------------------------------
app.listen(PORT, '0.0.0.0', () => {
  const lanIp = getLanIp();
  console.log(`抖音去水印下载工具已启动:`);
  console.log(`  本地访问: http://localhost:${PORT}`);
  if (lanIp !== '127.0.0.1') {
    console.log(`  手机访问: http://${lanIp}:${PORT}`);
  }
});
