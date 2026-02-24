// GET /api/export-emails — Admin-only: export email list
// Requires Authorization: Bearer ADMIN_KEY header

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export async function onRequestGet({ request, env }) {
  const authHeader = request.headers.get('Authorization');
  const key = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  if (!key || !env.ADMIN_KEY || !timingSafeEqual(key, env.ADMIN_KEY)) {
    return json({ error: 'Unauthorized.' }, 401);
  }

  const emailListRaw = await env.Q63_TRACKER.get('emails:list');
  const emails = emailListRaw ? JSON.parse(emailListRaw) : [];

  return json({
    success: true,
    count: emails.length,
    emails,
  });
}
