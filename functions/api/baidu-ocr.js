export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: '方法不允许' }), { status: 405, headers });
  }

  const apiKey = env.BAIDU_OCR_API_KEY;
  const secretKey = env.BAIDU_OCR_SECRET_KEY;

  if (!apiKey || !secretKey) {
    return new Response(JSON.stringify({
      error: '请在 Cloudflare Pages 环境变量中设置 BAIDU_OCR_API_KEY 和 BAIDU_OCR_SECRET_KEY',
    }), { status: 500, headers });
  }

  try {
    const body = await request.json();
    const { imageBase64 } = body;

    if (!imageBase64) {
      return new Response(JSON.stringify({ error: '缺少 imageBase64 参数' }), { status: 400, headers });
    }

    // 获取 access_token
    const tokenRes = await fetch(
      `https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=${apiKey}&client_secret=${secretKey}`,
      { method: 'POST' }
    );
    const tokenData = await tokenRes.json();

    if (!tokenData.access_token) {
      return new Response(JSON.stringify({
        error: `百度鉴权失败：${tokenData.error_description || tokenData.error || '未知错误'}`,
      }), { status: 500, headers });
    }

    // 调用 OCR
    const formData = new URLSearchParams();
    formData.append('image', imageBase64);

    const ocrRes = await fetch(
      `https://aip.baidubce.com/rest/2.0/ocr/v1/accurate_basic?access_token=${tokenData.access_token}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData.toString(),
      }
    );

    const ocrData = await ocrRes.json();

    if (ocrData.error_code) {
      return new Response(JSON.stringify({
        error: `百度 OCR 错误：${ocrData.error_msg}`,
      }), { status: 500, headers });
    }

    const words = ocrData.words_result?.map(w => w.words) || [];
    return new Response(JSON.stringify({ rawText: words.join('\n') }), { headers });

  } catch (e) {
    return new Response(JSON.stringify({
      error: `请求失败：${e.message}`,
    }), { status: 500, headers });
  }
}
