// GET /api/progress — Get all progress for logged-in user
// PUT /api/progress — Update a specific day's practices
// PUT Body: { day: number, practices: { exercise: { done: true, type: "Weights", notes: "..." }, ... } }

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

// Allowed extra fields per practice (beyond 'done' and 'notes')
const PRACTICE_FIELDS = {
  exercise: ['type'],
  sleep: ['hours', 'score'],
  breathing: ['coldPlunge', 'sauna'],
  nutrition: ['meal1', 'meal2', 'symptoms', 'snacking', 'cookingOil', 'salt'],
};

// Normalize v1 booleans to v2 objects
function normalizePractices(practices) {
  const result = {};
  for (const [key, val] of Object.entries(practices)) {
    if (!VALID_PRACTICES.includes(key)) continue;
    if (typeof val === 'boolean') {
      result[key] = { done: val, notes: '' };
    } else if (val && typeof val === 'object') {
      result[key] = val;
    } else {
      result[key] = { done: false, notes: '' };
    }
  }
  // Ensure all practices exist
  for (const key of VALID_PRACTICES) {
    if (!result[key]) {
      result[key] = { done: false, notes: '' };
    }
  }
  return result;
}

// Sanitize a single practice value from user input
function sanitizePractice(key, val) {
  // v1 backward compat: boolean → object
  if (typeof val === 'boolean') {
    return { done: val, notes: '' };
  }

  if (!val || typeof val !== 'object') {
    return { done: false, notes: '' };
  }

  const sanitized = { done: val.done === true };

  // Notes — all practices can have notes, truncate to 500 chars
  sanitized.notes = typeof val.notes === 'string' ? val.notes.slice(0, 500) : '';

  // Practice-specific fields
  const extraFields = PRACTICE_FIELDS[key] || [];

  if (extraFields.includes('type') && typeof val.type === 'string') {
    sanitized.type = val.type.slice(0, 50);
  }

  if (extraFields.includes('hours') && typeof val.hours === 'number') {
    sanitized.hours = Math.max(0, Math.min(24, val.hours));
  }

  if (extraFields.includes('score') && typeof val.score === 'number') {
    sanitized.score = Math.max(0, Math.min(100, Math.round(val.score)));
  }

  // Breathing advanced fields
  if (extraFields.includes('coldPlunge')) {
    sanitized.coldPlunge = val.coldPlunge === true;
  }
  if (extraFields.includes('sauna')) {
    sanitized.sauna = val.sauna === true;
  }

  // Nutrition-specific fields
  if (extraFields.includes('meal1') && val.meal1 && typeof val.meal1 === 'object') {
    sanitized.meal1 = {
      protein: typeof val.meal1.protein === 'string' ? val.meal1.protein.slice(0, 50) : '6 Eggs',
      fatChoice: typeof val.meal1.fatChoice === 'string' ? val.meal1.fatChoice.slice(0, 50) : '',
      mushrooms: val.meal1.mushrooms === true,
      time: typeof val.meal1.time === 'string' ? val.meal1.time.slice(0, 10) : '',
      done: val.meal1.done === true,
    };
  }

  if (extraFields.includes('meal2') && val.meal2 && typeof val.meal2 === 'object') {
    sanitized.meal2 = {
      protein: typeof val.meal2.protein === 'string' ? val.meal2.protein.slice(0, 50) : '',
      fatChoices: Array.isArray(val.meal2.fatChoices) ? val.meal2.fatChoices.filter(f => typeof f === 'string').slice(0, 3).map(f => f.slice(0, 50)) : [],
      vegetables: typeof val.meal2.vegetables === 'string' ? val.meal2.vegetables.slice(0, 100) : '',
      time: typeof val.meal2.time === 'string' ? val.meal2.time.slice(0, 10) : '',
      done: val.meal2.done === true,
    };
  }

  if (extraFields.includes('symptoms') && val.symptoms && typeof val.symptoms === 'object') {
    sanitized.symptoms = {
      bloating: val.symptoms.bloating === true,
      stomachPain: val.symptoms.stomachPain === true,
      constipation: val.symptoms.constipation === true,
      acidReflux: val.symptoms.acidReflux === true,
      tiredness: val.symptoms.tiredness === true,
      hunger: val.symptoms.hunger === true,
      cravings: val.symptoms.cravings === true,
    };
  }

  if (extraFields.includes('snacking')) {
    sanitized.snacking = val.snacking === true;
  }

  if (extraFields.includes('cookingOil') && typeof val.cookingOil === 'string') {
    sanitized.cookingOil = val.cookingOil.slice(0, 50);
  }

  if (extraFields.includes('salt')) {
    sanitized.salt = val.salt === true;
  }

  return sanitized;
}

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
    version: '2.0',
    startDate: user.startDate || null,
    timezone: user.timezone || null,
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
    const body = await request.json();
    const { day, practices, calendarDate } = body;

    if (!day || day < 1 || day > 63 || !Number.isInteger(day)) {
      return json({ error: 'Day must be an integer between 1 and 63.' }, 400);
    }

    if (!practices || typeof practices !== 'object') {
      return json({ error: 'Practices object is required.' }, 400);
    }

    // Sanitize each practice (supports v1 booleans and v2 objects)
    const sanitized = {};
    for (const key of VALID_PRACTICES) {
      sanitized[key] = sanitizePractice(key, practices[key]);
    }

    const score = VALID_PRACTICES.filter(k => sanitized[k].done).length;

    // Get current progress
    const progressRaw = await env.Q63_TRACKER.get(`progress:${session.email}`);
    const progress = progressRaw ? JSON.parse(progressRaw) : { days: {} };

    const dayEntry = {
      practices: sanitized,
      score,
      date: new Date().toISOString(),
    };

    // Store calendar date if provided
    if (calendarDate && typeof calendarDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(calendarDate)) {
      dayEntry.calendarDate = calendarDate;
    }

    progress.days[String(day)] = dayEntry;

    await env.Q63_TRACKER.put(`progress:${session.email}`, JSON.stringify(progress));

    // Set startDate if not set yet
    const userRaw = await env.Q63_TRACKER.get(`user:${session.email}`);
    if (userRaw) {
      const user = JSON.parse(userRaw);
      if (!user.startDate) {
        user.startDate = calendarDate || new Date().toISOString().split('T')[0];
        await env.Q63_TRACKER.put(`user:${session.email}`, JSON.stringify(user));
      }
    }

    return json({ success: true, version: '2.0', day, score, practices: sanitized, calendarDate: dayEntry.calendarDate });
  } catch (err) {
    return json({ error: 'Failed to save progress.' }, 500);
  }
}
