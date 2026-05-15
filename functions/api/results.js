export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  if (!env.DB) {
    return new Response(JSON.stringify({ error: 'D1 数据库未绑定' }), { status: 500, headers });
  }

  // 自动建表
  try {
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS results (
        cache_key TEXT PRIMARY KEY,
        name TEXT NOT NULL DEFAULT '',
        gender TEXT NOT NULL DEFAULT '',
        raw_text TEXT NOT NULL DEFAULT '',
        result_json TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )
    `).run();
  } catch {}

  if (request.method === 'GET') {
    const url = new URL(request.url);
    const key = url.searchParams.get('key');
    if (!key) {
      return new Response(JSON.stringify({ error: '缺少 key 参数' }), { status: 400, headers });
    }

    try {
      const { results } = await env.DB.prepare(
        'SELECT result_json FROM results WHERE cache_key = ?'
      ).bind(key).all();

      if (results.length > 0) {
        return new Response(results[0].result_json, { headers });
      }
      return new Response(JSON.stringify(null), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
    }
  }

  if (request.method === 'POST') {
    try {
      const body = await request.json();
      const { key, name, gender, rawText, result } = body;
      if (!key || !result) {
        return new Response(JSON.stringify({ error: '缺少 key 或 result' }), { status: 400, headers });
      }

      await env.DB.prepare(
        'INSERT OR REPLACE INTO results (cache_key, name, gender, raw_text, result_json, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(key, name || '', gender || '', rawText || '', JSON.stringify(result), Date.now()).run();

      return new Response(JSON.stringify({ ok: true }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
    }
  }

  return new Response(JSON.stringify({ error: '不允许的方法' }), { status: 405, headers });
}
