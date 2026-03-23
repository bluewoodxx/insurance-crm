export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname.replace('/api/', '');
  const method = request.method;

  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (method === 'OPTIONS') {
    return new Response(null, { headers });
  }

  try {
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      birth TEXT,
      idback TEXT,
      channel TEXT,
      manager TEXT,
      status TEXT,
      regdate TEXT,
      job TEXT,
      consult_type TEXT,
      bizaddr TEXT,
      homeaddr TEXT,
      home_own TEXT,
      claims TEXT DEFAULT '[]',
      insurances TEXT DEFAULT '[]',
      modified_at TEXT
    )`).run();

    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS memos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cust_id INTEGER NOT NULL,
      datetime TEXT NOT NULL,
      author TEXT,
      text TEXT NOT NULL,
      edited_at TEXT
    )`).run();

    if (path === 'customers' && method === 'GET') {
      const { results } = await env.DB.prepare('SELECT * FROM customers ORDER BY id DESC').all();
      const customers = results.map(r => ({
        ...r,
        claims: JSON.parse(r.claims || '[]'),
        insurances: JSON.parse(r.insurances || '[]'),
        consultType: r.consult_type,
        homeOwn: r.home_own,
        modifiedAt: r.modified_at,
      }));
      return new Response(JSON.stringify(customers), { headers });
    }

    if (path.startsWith('customers/') && method === 'GET') {
      const id = path.split('/')[1];
      const r = await env.DB.prepare('SELECT * FROM customers WHERE id = ?').bind(id).first();
      if (!r) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers });
      return new Response(JSON.stringify({
        ...r,
        claims: JSON.parse(r.claims || '[]'),
        insurances: JSON.parse(r.insurances || '[]'),
        consultType: r.consult_type,
        homeOwn: r.home_own,
        modifiedAt: r.modified_at,
      }), { headers });
    }

    if (path === 'customers' && method === 'POST') {
      const body = await request.json();
      const result = await env.DB.prepare(
        `INSERT INTO customers (name,phone,birth,idback,channel,manager,status,regdate,job,consult_type,bizaddr,homeaddr,home_own,claims,insurances,modified_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      ).bind(
        body.name, body.phone||'', body.birth||'', body.idback||'',
        body.channel||'', body.manager||'', body.status||'통화요청',
        body.regdate||'', body.job||'', body.consultType||'',
        body.bizaddr||'', body.homeaddr||'', body.homeOwn||'',
        JSON.stringify(body.claims||[]), JSON.stringify(body.insurances||[]),
        body.modifiedAt||''
      ).run();
      return new Response(JSON.stringify({ id: result.meta.last_row_id }), { headers });
    }

    if (path.startsWith('customers/') && method === 'PUT') {
      const id = path.split('/')[1];
      const body = await request.json();
      await env.DB.prepare(
        `UPDATE customers SET name=?,phone=?,birth=?,idback=?,channel=?,manager=?,status=?,regdate=?,job=?,consult_type=?,bizaddr=?,homeaddr=?,home_own=?,claims=?,insurances=?,modified_at=? WHERE id=?`
      ).bind(
        body.name, body.phone||'', body.birth||'', body.idback||'',
        body.channel||'', body.manager||'', body.status||'',
        body.regdate||'', body.job||'', body.consultType||'',
        body.bizaddr||'', body.homeaddr||'', body.homeOwn||'',
        JSON.stringify(body.claims||[]), JSON.stringify(body.insurances||[]),
        body.modifiedAt||'', id
      ).run();
      return new Response(JSON.stringify({ ok: true }), { headers });
    }

    if (path.startsWith('customers/') && method === 'DELETE') {
      const id = path.split('/')[1];
      await env.DB.prepare('DELETE FROM customers WHERE id=?').bind(id).run();
      await env.DB.prepare('DELETE FROM memos WHERE cust_id=?').bind(id).run();
      return new Response(JSON.stringify({ ok: true }), { headers });
    }

    if (path.startsWith('memos') && method === 'GET') {
      const custId = url.searchParams.get('custId');
      const { results } = custId
        ? await env.DB.prepare('SELECT * FROM memos WHERE cust_id=? ORDER BY datetime DESC').bind(custId).all()
        : await env.DB.prepare('SELECT * FROM memos ORDER BY datetime DESC').all();
      const memos = results.map(r => ({ ...r, custId: r.cust_id, editedAt: r.edited_at }));
      return new Response(JSON.stringify(memos), { headers });
    }

    if (path === 'memos' && method === 'POST') {
      const body = await request.json();
      const result = await env.DB.prepare(
        'INSERT INTO memos (cust_id,datetime,author,text) VALUES (?,?,?,?)'
      ).bind(body.custId, body.datetime, body.author||'', body.text).run();
      return new Response(JSON.stringify({ id: result.meta.last_row_id }), { headers });
    }

    if (path.startsWith('memos/') && method === 'PUT') {
      const id = path.split('/')[1];
      const body = await request.json();
      await env.DB.prepare('UPDATE memos SET text=?,edited_at=? WHERE id=?')
        .bind(body.text, body.editedAt||'', id).run();
      return new Response(JSON.stringify({ ok: true }), { headers });
    }

    if (path.startsWith('memos/') && method === 'DELETE') {
      const id = path.split('/')[1];
      await env.DB.prepare('DELETE FROM memos WHERE id=?').bind(id).run();
      return new Response(JSON.stringify({ ok: true }), { headers });
    }

    return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
  }
}
