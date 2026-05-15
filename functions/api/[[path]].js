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

    // DeepSeek 长时间生成用流式避免 Cloudflare 60s 超时
    const useStream = service === 'deepseek' && endpoint === 'chat/completions';
    if (useStream) {
      bodyJson.stream = true;
    }

    const upstreamBody = JSON.stringify(bodyJson);

    const res = await fetch(targetUrl, {
      method: request.method,
      headers: proxyHeaders,
      body: upstreamBody,
    });

    if (!res.ok) {
      const errorText = await res.text();
      return new Response(errorText, {
        status: res.status,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    // 非流式直接透传
    if (!useStream) {
      const responseHeaders = new Headers(res.headers);
      responseHeaders.set('Access-Control-Allow-Origin', '*');
      return new Response(res.body, {
        status: res.status,
        statusText: res.statusText,
        headers: responseHeaders,
      });
    }

    // 流式：收集 SSE 拼接完整响应
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';
    let finishReason = '';
    let model = '';
    let id = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') continue;

        try {
          const chunk = JSON.parse(data);
          id = chunk.id || id;
          model = chunk.model || model;
          const choice = chunk.choices?.[0];
          if (choice?.delta?.content) {
            fullContent += choice.delta.content;
          }
          if (choice?.finish_reason) {
            finishReason = choice.finish_reason;
          }
        } catch {
          // skip malformed SSE chunk
        }
      }
    }

    const finalResponse = {
      id,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: fullContent,
        },
        finish_reason: finishReason || 'stop',
      }],
    };

    return new Response(JSON.stringify(finalResponse), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
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
