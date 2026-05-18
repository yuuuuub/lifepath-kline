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

  const respHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: respHeaders });
  }

  const apiKey = env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: '请在 Cloudflare Pages 环境变量中设置 DEEPSEEK_API_KEY' }), { status: 500, headers: respHeaders });
  }

  try {
    const body = await request.json();

    // 内部强制流式请求，防止长时间生成时 Cloudflare 30s 超时
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
      return new Response(errorText, { status: deepseekRes.status, headers: respHeaders });
    }

    // 收集 SSE 流，拼成完整 JSON 返回给前端
    const reader = deepseekRes.body.getReader();
    const decoder = new TextDecoder();
    const chunks = [];
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;
          chunks.push(data);
        }
      }
    }

    // 处理结尾剩余
    if (buffer.startsWith('data: ')) {
      const data = buffer.slice(6).trim();
      if (data !== '[DONE]') chunks.push(data);
    }

    // 拼装完整 JSON 响应（只在最后一个 chunk 中有 usage 信息）
    const lastChunk = chunks.length > 0 ? JSON.parse(chunks[chunks.length - 1]) : {};
    const allContent = chunks
      .map(c => { try { return JSON.parse(c); } catch { return null; } })
      .filter(Boolean)
      .map(c => c.choices?.[0]?.delta?.content || '')
      .join('');

    const result = {
      id: lastChunk.id || 'chatcmpl-stream',
      object: 'chat.completion',
      created: lastChunk.created || Math.floor(Date.now() / 1000),
      model: lastChunk.model || 'deepseek-chat',
      choices: [{
        index: 0,
        message: { role: 'assistant', content: allContent },
        finish_reason: lastChunk.choices?.[0]?.finish_reason || 'stop',
      }],
      usage: lastChunk.usage || null,
    };

    return new Response(JSON.stringify(result), { headers: respHeaders });
  } catch (e) {
    return new Response(JSON.stringify({ error: `请求失败：${e.message}` }), { status: 500, headers: respHeaders });
  }
}
