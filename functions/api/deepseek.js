export async function onRequest(context) {
  const { request, env } = context;

  const respHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: respHeaders });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...respHeaders, 'Content-Type': 'application/json' },
    });
  }

  const apiKey = env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: '请在 Cloudflare Pages 环境变量中设置 DEEPSEEK_API_KEY' }), {
      status: 500,
      headers: { ...respHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await request.json();

    const deepseekRes = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!deepseekRes.ok) {
      const errorText = await deepseekRes.text();
      return new Response(errorText, {
        status: deepseekRes.status,
        headers: { ...respHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await deepseekRes.text();
    return new Response(data, {
      headers: { ...respHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: `请求失败：${e.message}` }), {
      status: 500,
      headers: { ...respHeaders, 'Content-Type': 'application/json' },
    });
  }
}
