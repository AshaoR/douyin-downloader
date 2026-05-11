const videoUrlInput = document.getElementById('videoUrl');
const parseBtn = document.getElementById('parseBtn');
const loading = document.getElementById('loading');
const error = document.getElementById('error');
const result = document.getElementById('result');
const coverImg = document.getElementById('coverImg');
const videoPlayer = document.getElementById('videoPlayer');
const playOverlay = document.getElementById('playOverlay');
const videoDesc = document.getElementById('videoDesc');
const videoAuthor = document.getElementById('videoAuthor');
const downloadBtn = document.getElementById('downloadBtn');
const copyLinkBtn = document.getElementById('copyLinkBtn');
const iosHint = document.getElementById('iosHint');

let currentVideoUrl = '';

parseBtn.addEventListener('click', parseVideo);
videoUrlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') parseVideo();
});

async function parseVideo() {
  const url = videoUrlInput.value.trim();
  if (!url) {
    showError('请输入抖音分享链接');
    return;
  }

  hideAll();
  loading.classList.remove('hidden');
  parseBtn.disabled = true;

  try {
    const res = await fetch('/api/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });

    const data = await res.json();

    if (!data.success) {
      showError(data.error || '解析失败');
      return;
    }

    showResult(data.data);
  } catch (err) {
    showError('网络错误，请稍后重试');
  } finally {
    parseBtn.disabled = false;
  }
}

function showResult(data) {
  loading.classList.add('hidden');

  // 封面图
  if (data.cover_url) {
    coverImg.src = data.cover_url;
    coverImg.style.display = 'block';
    videoPlayer.style.display = 'none';
    playOverlay.classList.remove('hidden');
  } else {
    coverImg.style.display = 'none';
    playOverlay.classList.add('hidden');
  }

  // 视频源
  videoPlayer.src = data.video_url;
  videoPlayer.poster = data.cover_url || '';

  // 文字信息
  videoDesc.textContent = data.desc || '抖音视频';
  videoAuthor.textContent = data.author ? '@' + data.author : '';

  // 下载按钮 → 直接打开视频地址
  currentVideoUrl = data.video_url;
  downloadBtn.href = data.video_url;

  // iOS 提示
  if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
    iosHint.classList.remove('hidden');
  }

  result.classList.remove('hidden');
}

// 点击封面开始预览
coverImg.addEventListener('click', () => {
  coverImg.style.display = 'none';
  playOverlay.classList.add('hidden');
  videoPlayer.style.display = 'block';
  videoPlayer.play().catch(() => {});
});

function showError(msg) {
  loading.classList.add('hidden');
  error.textContent = msg;
  error.classList.remove('hidden');
}

function hideAll() {
  error.classList.add('hidden');
  result.classList.add('hidden');
  loading.classList.add('hidden');
  iosHint.classList.add('hidden');
}

// 复制视频链接
copyLinkBtn.addEventListener('click', () => {
  if (!currentVideoUrl) return;
  navigator.clipboard.writeText(currentVideoUrl).then(
    () => flashBtn(copyLinkBtn, '已复制!'),
    () => {
      const ta = document.createElement('textarea');
      ta.value = currentVideoUrl;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      flashBtn(copyLinkBtn, '已复制!');
    }
  );
});

function flashBtn(btn, text) {
  const orig = btn.textContent;
  btn.textContent = text;
  setTimeout(() => { btn.textContent = orig; }, 2000);
}

videoUrlInput.focus();
