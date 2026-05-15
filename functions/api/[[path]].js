export async function onRequest(context) {
  const { request, params, env } = context;
  const url = new URL(request.url);

  const segments = params.path || [];
  if (segments.length < 2) {
    return new Response(JSON.stringify({ error: 'Invalid proxy path' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const service = segments[0];
  const endpoint = segments.slice(1).join('/');

  const SERVICE_BASE = {
    deepseek: 'https://api.deepseek.com/v1',
    vision: env.VISION_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  };

  const baseUrl = SERVICE_BASE[service];
  if (!baseUrl) {
    return new Response(JSON.stringify({ error: `Unknown service: ${service}` }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const targetUrl = `${baseUrl}/${endpoint}${url.search}`;

  const envKeyName = service === 'deepseek' ? 'DEEPSEEK_API_KEY' : 'VISION_API_KEY';
  let apiKey = env[envKeyName] || '';

  if (!apiKey) {
    const authHeader = request.headers.get('Authorization') || request.headers.get('authorization') || '';
    apiKey = authHeader.replace(/^Bearer\s+/i, '').trim();
  }

  if (!apiKey) {
    return new Response(
      JSON.stringify({
        error: `缺少 ${service} API Key。请在 Cloudflare Pages 环境变量中设置 ${envKeyName}。`,
      }),
      {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  const proxyHeaders = new Headers();
  proxyHeaders.set('Content-Type', 'application/json');
  proxyHeaders.set('Authorization', `Bearer ${apiKey}`);

  try {
    const bodyText = await request.text();
    const bodyJson = JSON.parse(bodyText);

    const useStream = service === 'deepseek' && endpoint === 'chat/completions';
    if (useStream) {
      bodyJson.stream = true;
      bodyJson.stream_options = { include_usage: true };
    }

    const res = await fetch(targetUrl, {
      method: request.method,
      headers: proxyHeaders,
      body: JSON.stringify(bodyJson),
    });

    if (!res.ok) {
      const errorText = await res.text();
      return new Response(errorText, {
        status: res.status,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    const responseHeaders = new Headers();
    responseHeaders.set('Access-Control-Allow-Origin', '*');

    if (useStream) {
      responseHeaders.set('Content-Type', 'text/event-stream');
      responseHeaders.set('Cache-Control', 'no-cache');
      responseHeaders.set('Connection', 'keep-alive');

      const upstreamReader = res.body.getReader();
      const encoder = new TextEncoder();
      const keepaliveMsg = encoder.encode(': keepalive\n\n');
      let lastDataTime = Date.now();

      const keepaliveStream = new ReadableStream({
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

      return new Response(keepaliveStream, {
        status: res.status,
        headers: responseHeaders,
      });
    }

    const upstreamCT = res.headers.get('Content-Type') || 'application/json';
    responseHeaders.set('Content-Type', upstreamCT);

    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: '代理请求失败', details: error.message }),
      {
        status: 502,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      }
    );
  }
}
