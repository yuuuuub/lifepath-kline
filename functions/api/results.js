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

  // 兼容旧表：新增字段
  for (const col of ['image_base64 TEXT', 'bazi_sections TEXT']) {
    try { await env.DB.prepare(`ALTER TABLE results ADD COLUMN ${col}`).run(); } catch {}
  }

  if (request.method === 'GET') {
    const url = new URL(request.url);
    const key = url.searchParams.get('key');

    try {
      // 无 key → 返回概览（不泄露完整数据）
      if (!key) {
        const { results: countResult } = await env.DB.prepare(
          'SELECT COUNT(*) as total FROM results'
        ).all();
        const { results: latest } = await env.DB.prepare(
          'SELECT cache_key, name, gender, raw_text, created_at FROM results ORDER BY created_at DESC LIMIT 10'
        ).all();
        return new Response(JSON.stringify({
          total: countResult[0]?.total || 0,
          latest: latest.map(r => ({
            key: r.cache_key?.substring(0, 8) + '...',
            name: r.name,
            gender: r.gender,
            bazi: (r.raw_text || '').substring(0, 60),
            time: new Date(r.created_at).toISOString(),
          })),
        }), { headers });
      }

      // 有 key → 返回完整结果
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
      const { key, name, gender, rawText, result, sections } = body;

      if (sections && !result) {
        // 仅保存七板块
        if (!key || !sections) {
          return new Response(JSON.stringify({ error: '缺少 key 或 sections' }), { status: 400, headers });
        }
        await env.DB.prepare(
          'INSERT OR REPLACE INTO results (cache_key, name, gender, raw_text, result_json, bazi_sections, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).bind(key, name || '', gender || '', rawText || '', '{}', JSON.stringify(sections), Date.now()).run();
        return new Response(JSON.stringify({ ok: true }), { headers });
      }

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
