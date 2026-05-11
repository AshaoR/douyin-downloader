const axios = require('axios');

// 抖音 APP 的 User-Agent — 用浏览器的 UA 会触犯验证码
const MOBILE_UA =
  'com.ss.android.ugc.aweme/800 (Linux; U; Android 8.0; zh_CN; Nexus 6P; Build/OPM1.171019.011)';

// ---------------------------------------------------------------------------
// Helper: 从 HTML 中提取视频数据
// ---------------------------------------------------------------------------
function parseVideoFromHtml(html) {
  const uriMatch = html.match(/"play_addr"\s*:\s*\{[^}]*"uri"\s*:\s*"([^"]+)"/);
  const videoId = uriMatch ? uriMatch[1] : '';

  const descMatch = html.match(/"desc"\s*:\s*"([^"]+)"/);
  const desc = descMatch ? descMatch[1].replace(/\\u002F/g, '/').replace(/\\"/g, '"') : '';

  const nickMatch = html.match(/"nickname"\s*:\s*"([^"]+)"/);
  const author = nickMatch ? nickMatch[1] : '';

  const coverMatch = html.match(/"cover"\s*:\s*\{[^}]*"url_list"\s*:\s*\["([^"]+)"/);
  let coverUrl = coverMatch ? coverMatch[1].replace(/\\u002F/g, '/') : '';
  if (!coverUrl) {
    const ocMatch = html.match(/"origin_cover"\s*:\s*\{[^}]*"url_list"\s*:\s*\["([^"]+)"/);
    if (ocMatch) coverUrl = ocMatch[1].replace(/\\u002F/g, '/');
  }
  if (!coverUrl) {
    const dcMatch = html.match(/"dynamic_cover"\s*:\s*\{[^}]*"url_list"\s*:\s*\["([^"]+)"/);
    if (dcMatch) coverUrl = dcMatch[1].replace(/\\u002F/g, '/');
  }

  return { videoId, desc, author, coverUrl };
}

// ---------------------------------------------------------------------------
// POST /api/parse
// ---------------------------------------------------------------------------
module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const inputUrl = (req.body?.url || '').trim();
    if (!inputUrl) {
      return res.json({ success: false, error: '请输入抖音分享链接' });
    }

    let pageUrl = inputUrl;

    // 短链接 → 跟随跳转
    if (/v\.douyin\.com/i.test(inputUrl)) {
      try {
        const redirect = await axios.get(inputUrl, {
          headers: { 'User-Agent': MOBILE_UA, 'Accept-Language': 'zh-CN,zh;q=0.9' },
          maxRedirects: 0,
          validateStatus: (s) => s === 301 || s === 302,
          timeout: 10000,
        });
        if (redirect.headers['location']) pageUrl = redirect.headers['location'];
      } catch (e) {
        return res.json({ success: false, error: '无法解析分享链接' });
      }
    }

    // 获取页面 HTML
    let html;
    try {
      const pageResp = await axios.get(pageUrl, {
        headers: { 'User-Agent': MOBILE_UA, 'Accept-Language': 'zh-CN,zh;q=0.9' },
        timeout: 15000,
        maxRedirects: 5,
      });
      html = pageResp.data;
    } catch (e) {
      return res.json({ success: false, error: '获取视频页面失败' });
    }

    if (!html || html.length < 1000) {
      return res.json({ success: false, error: '获取视频页面失败' });
    }

    // 解析
    const info = parseVideoFromHtml(html);
    if (!info.videoId) {
      return res.json({ success: false, error: '未找到视频数据' });
    }

    // 无水印播放地址: play 不包含水印，playwm 包含水印
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
};
