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

    body.stream = true;
    body.stream_options = { include_usage: true };

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

    // 流式透传 SSE，避免 Cloudflare Functions 超时
    const upstreamReader = deepseekRes.body.getReader();
    const encoder = new TextEncoder();
    const keepaliveMsg = encoder.encode(': keepalive\n\n');
    let lastDataTime = Date.now();

    const sseStream = new ReadableStream({
      async start(controller) {
        const keepaliveTimer = setInterval(() => {
          if (Date.now() - lastDataTime > 25000) {
            try { controller.enqueue(keepaliveMsg); } catch { clearInterval(keepaliveTimer); }
          }
        }, 25000);

        try {
          while (true) {
            const { done, value } = await upstreamReader.read();
            if (done) { clearInterval(keepaliveTimer); controller.close(); break; }
            lastDataTime = Date.now();
            controller.enqueue(value);
          }
        } catch (e) {
          clearInterval(keepaliveTimer);
          controller.error(e);
        }
      },
    });

    return new Response(sseStream, {
      headers: {
        ...respHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: `请求失败：${e.message}` }), {
      status: 500,
      headers: { ...respHeaders, 'Content-Type': 'application/json' },
    });
  }
}
