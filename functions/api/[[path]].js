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

  const proxyHeaders = new Headers(request.headers);
  proxyHeaders.delete('host');
  proxyHeaders.delete('origin');
  proxyHeaders.delete('referer');

  try {
    const response = await fetch(targetUrl, {
      method: request.method,
      headers: proxyHeaders,
      body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
    });

    const responseHeaders = new Headers(response.headers);
    responseHeaders.set('Access-Control-Allow-Origin', '*');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
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
