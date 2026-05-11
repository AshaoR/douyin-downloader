const MOBILE_UA =
  'com.ss.android.ugc.aweme/800 (Linux; U; Android 8.0; zh_CN; Nexus 6P; Build/OPM1.171019.011)';

// ---------------------------------------------------------------------------
// 从页面 HTML 提取视频数据
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
export async function onRequest(context) {
  const { request } = context;

  // CORS
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json; charset=utf-8',
  };

  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ success: false, error: '请求格式错误' }), { status: 400, headers });
    }

    const inputUrl = (body.url || '').trim();
    if (!inputUrl) {
      return new Response(JSON.stringify({ success: false, error: '请输入抖音分享链接' }), { status: 200, headers });
    }

    let pageUrl = inputUrl;

    // 短链接 → 跟随跳转
    if (/v\.douyin\.com/i.test(inputUrl)) {
      try {
        const redirectResp = await fetch(inputUrl, {
          headers: { 'User-Agent': MOBILE_UA, 'Accept-Language': 'zh-CN,zh;q=0.9' },
          redirect: 'manual',
        });
        const location = redirectResp.headers.get('location');
        if (location) pageUrl = location;
      } catch {
        return new Response(JSON.stringify({ success: false, error: '无法解析分享链接' }), { status: 200, headers });
      }
    }

    // 获取页面 HTML
    let html;
    try {
      const pageResp = await fetch(pageUrl, {
        headers: { 'User-Agent': MOBILE_UA, 'Accept-Language': 'zh-CN,zh;q=0.9' },
      });
      html = await pageResp.text();
    } catch {
      return new Response(JSON.stringify({ success: false, error: '获取视频页面失败' }), { status: 200, headers });
    }

    if (!html || html.length < 1000) {
      return new Response(JSON.stringify({ success: false, error: '获取视频页面失败' }), { status: 200, headers });
    }

    // 解析
    const info = parseVideoFromHtml(html);
    if (!info.videoId) {
      return new Response(JSON.stringify({ success: false, error: '未找到视频数据，请确认链接有效' }), { status: 200, headers });
    }

    const videoUrl = `https://aweme.snssdk.com/aweme/v1/play/?video_id=${info.videoId}&ratio=1080p&line=0`;

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          video_url: videoUrl,
          cover_url: info.coverUrl,
          author: info.author,
          desc: info.desc || '抖音视频',
          ext: 'mp4',
        },
      }),
      { status: 200, headers }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: '服务器错误，请稍后重试' }),
      { status: 200, headers }
    );
  }
}
