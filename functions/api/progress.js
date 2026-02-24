// GET /api/progress — Get all progress for logged-in user
// PUT /api/progress — Update a specific day's practices
// PUT Body: { day: number, practices: { exercise: bool, breathing: bool, ... } }

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}

async function getSession(request, env) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.slice(7);
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const sessionRaw = await env.Q63_TRACKER.get(`session:${token}`);
  if (!sessionRaw) return null;

  const session = JSON.parse(sessionRaw);
  if (new Date(session.expiresAt) < new Date()) {
    await env.Q63_TRACKER.delete(`session:${token}`);
    return null;
  }

  return session;
}

const VALID_PRACTICES = ['exercise', 'breathing', 'meditation', 'sleep', 'gratitude', 'hydration', 'nutrition'];

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export async function onRequestGet({ request, env }) {
  const session = await getSession(request, env);
  if (!session) {
    return json({ error: 'Unauthorized. Please log in.' }, 401);
  }

  // Get user data for startDate
  const userRaw = await env.Q63_TRACKER.get(`user:${session.email}`);
  const user = userRaw ? JSON.parse(userRaw) : {};

  const progressRaw = await env.Q63_TRACKER.get(`progress:${session.email}`);
  const progress = progressRaw ? JSON.parse(progressRaw) : { days: {} };

  return json({
    success: true,
    startDate: user.startDate || null,
    name: user.name || '',
    progress,
  });
}

export async function onRequestPut({ request, env }) {
  const session = await getSession(request, env);
  if (!session) {
    return json({ error: 'Unauthorized. Please log in.' }, 401);
  }

  try {
    const { day, practices } = await request.json();

    if (!day || day < 1 || day > 63 || !Number.isInteger(day)) {
      return json({ error: 'Day must be an integer between 1 and 63.' }, 400);
    }

    if (!practices || typeof practices !== 'object') {
      return json({ error: 'Practices object is required.' }, 400);
    }

    // Validate practices — only allow known keys with boolean values
    const sanitized = {};
    for (const key of VALID_PRACTICES) {
      sanitized[key] = practices[key] === true;
    }

    const score = Object.values(sanitized).filter(Boolean).length;

    // Get current progress
    const progressRaw = await env.Q63_TRACKER.get(`progress:${session.email}`);
    const progress = progressRaw ? JSON.parse(progressRaw) : { days: {} };

    progress.days[String(day)] = {
      practices: sanitized,
      score,
      date: new Date().toISOString(),
    };

    await env.Q63_TRACKER.put(`progress:${session.email}`, JSON.stringify(progress));

    // Set startDate if this is day 1 and startDate isn't set
    const userRaw = await env.Q63_TRACKER.get(`user:${session.email}`);
    if (userRaw) {
      const user = JSON.parse(userRaw);
      if (!user.startDate && day === 1) {
        user.startDate = new Date().toISOString().split('T')[0];
        await env.Q63_TRACKER.put(`user:${session.email}`, JSON.stringify(user));
      }
    }

    return json({ success: true, day, score, practices: sanitized });
  } catch (err) {
    return json({ error: 'Failed to save progress.' }, 500);
  }
}
