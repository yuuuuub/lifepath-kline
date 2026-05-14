export async function onRequest(context) {
  const { request, params } = context;
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
    vision: 'https://api.openai.com/v1',
  };

  const baseUrl = SERVICE_BASE[service];
  if (!baseUrl) {
    return new Response(JSON.stringify({ error: `Unknown service: ${service}` }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const targetUrl = `${baseUrl}/${endpoint}${url.search}`;

  const proxyHeaders = new Headers();
  for (const [key, value] of request.headers) {
    const lower = key.toLowerCase();
    if (lower === 'host' || lower === 'origin' || lower === 'referer') continue;
    if (lower.startsWith('cf-') || lower === 'x-forwarded-for' || lower === 'x-real-ip') continue;
    proxyHeaders.set(key, value);
  }

  try {
    const res = await fetch(targetUrl, {
      method: request.method,
      headers: proxyHeaders,
      body: request.body,
    });

    const responseHeaders = new Headers(res.headers);
    responseHeaders.set('Access-Control-Allow-Origin', '*');

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
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
