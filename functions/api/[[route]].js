export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname.replace('/api/', '');
  const method = request.method;

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // OCR 프록시 - Google Cloud Vision API
  if (path === 'ocr' && method === 'POST') {
    try {
      const body = await request.json();
      const { b64, mediaType } = body;
      const apiKey = env.GOOGLE_VISION_KEY;

      if (!apiKey) {
        return new Response(JSON.stringify({ error: 'GOOGLE_VISION_KEY 환경변수가 설정되지 않았습니다.' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const visionRes = await fetch(
        `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requests: [{
              image: { content: b64 },
              features: [
                { type: 'TEXT_DETECTION', maxResults: 1 },
                { type: 'DOCUMENT_TEXT_DETECTION', maxResults: 1 }
              ]
            }]
          })
        }
      );

      const data = await visionRes.json();
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }

  // D1 CRUD
  const db = env.DB;
  if (!db) {
    return new Response(JSON.stringify({ error: 'DB not configured' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    let result;

    if (path === 'customers') {
      if (method === 'GET') {
        const { results } = await db.prepare('SELECT * FROM customers ORDER BY regdate DESC').all();
        result = results;
      } else if (method === 'POST') {
        const b = await request.json();
        const stmt = await db.prepare(
          `INSERT INTO customers (name,phone,birth,idback,channel,manager,status,regdate,job,consult_type,bizaddr,homeaddr,home_own,claims,insurances,modified_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
        ).bind(
          b.name||'', b.phone||'', b.birth||'', b.idback||'',
          b.channel||'', b.manager||'', b.status||'', b.regdate||'',
          b.job||'', b.consultType||b.consult_type||'',
          b.bizaddr||'', b.homeaddr||'', b.homeOwn||b.home_own||'',
          JSON.stringify(b.claims||[]), JSON.stringify(b.insurances||[]),
          b.modifiedAt||b.modified_at||''
        ).run();
        result = { id: stmt.meta.last_row_id };
      }
    } else if (path.startsWith('customers/')) {
      const id = path.split('/')[1];
      if (method === 'PUT') {
        const b = await request.json();
        await db.prepare(
          `UPDATE customers SET name=?,phone=?,birth=?,idback=?,channel=?,status=?,regdate=?,job=?,consult_type=?,bizaddr=?,homeaddr=?,home_own=?,claims=?,insurances=?,modified_at=? WHERE id=?`
        ).bind(
          b.name||'', b.phone||'', b.birth||'', b.idback||'',
          b.channel||'', b.status||'', b.regdate||'',
          b.job||'', b.consultType||b.consult_type||'',
          b.bizaddr||'', b.homeaddr||'', b.homeOwn||b.home_own||'',
          JSON.stringify(b.claims||[]), JSON.stringify(b.insurances||[]),
          b.modifiedAt||b.modified_at||'', id
        ).run();
        // callbackAt 별도 업데이트 시도 (컬럼 없으면 무시)
        try {
          if (b.callbackAt !== undefined) {
            await db.prepare('UPDATE customers SET callbackAt=? WHERE id=?')
              .bind(b.callbackAt||'', id).run();
          }
        } catch(e) { /* callbackAt 컬럼 없으면 무시 */ }
        result = { ok: true };
      } else if (method === 'DELETE') {
        await db.prepare('DELETE FROM customers WHERE id=?').bind(id).run();
        await db.prepare('DELETE FROM memos WHERE cust_id=?').bind(id).run();
        result = { ok: true };
      }
    } else if (path === 'memos' || path.startsWith('memos?')) {
      if (method === 'GET') {
        const custId = url.searchParams.get('custId');
        if (custId) {
          const { results } = await db.prepare('SELECT * FROM memos WHERE cust_id=? ORDER BY datetime DESC').bind(custId).all();
          result = results;
        } else {
          const { results } = await db.prepare('SELECT * FROM memos ORDER BY datetime DESC').all();
          result = results;
        }
      } else if (method === 'POST') {
        const b = await request.json();
        const stmt = await db.prepare(
          'INSERT INTO memos (cust_id, datetime, author, text) VALUES (?,?,?,?)'
        ).bind(b.custId, b.datetime||'', b.author||'', b.text||'').run();
        result = { id: stmt.meta.last_row_id };
      }
    } else if (path.startsWith('memos/')) {
      const id = path.split('/')[1];
      if (method === 'PUT') {
        const b = await request.json();
        await db.prepare('UPDATE memos SET text=?, edited_at=? WHERE id=?')
          .bind(b.text||'', b.editedAt||'', id).run();
        result = { ok: true };
      } else if (method === 'DELETE') {
        await db.prepare('DELETE FROM memos WHERE id=?').bind(id).run();
        result = { ok: true };
      }
    } else {
      result = { error: 'unknown path: ' + path };
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
