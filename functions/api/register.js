// POST /api/register — Create new account
// Body: { email, name, password }

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}

async function hashPassword(password, salt) {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const hashBuffer = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: encoder.encode(salt), iterations: 600000, hash: 'SHA-256' },
    keyMaterial, 256
  );
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function generateSalt() {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export async function onRequestPost({ request, env }) {
  try {
    const { email, name, password } = await request.json();

    if (!email || !name || !password) {
      return json({ error: 'Email, name, and password are required.' }, 400);
    }

    const normalizedEmail = email.toLowerCase().trim();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return json({ error: 'Invalid email address.' }, 400);
    }

    if (password.length < 8 || password.length > 256) {
      return json({ error: 'Password must be between 8 and 256 characters.' }, 400);
    }

    if (name.trim().length < 1 || name.trim().length > 100) {
      return json({ error: 'Name must be between 1 and 100 characters.' }, 400);
    }

    // Check if user already exists
    const existing = await env.Q63_TRACKER.get(`user:${normalizedEmail}`);
    if (existing) {
      return json({ error: 'An account with this email already exists.' }, 409);
    }

    // Hash password
    const salt = generateSalt();
    const passwordHash = await hashPassword(password, salt);

    // Create user
    const user = {
      email: normalizedEmail,
      name: name.trim(),
      passwordHash,
      salt,
      startDate: null, // Set when they first check in
      createdAt: new Date().toISOString(),
    };

    await env.Q63_TRACKER.put(`user:${normalizedEmail}`, JSON.stringify(user));

    // Initialize empty progress
    await env.Q63_TRACKER.put(`progress:${normalizedEmail}`, JSON.stringify({ days: {} }));

    // Add to email list
    const emailListRaw = await env.Q63_TRACKER.get('emails:list');
    const emailList = emailListRaw ? JSON.parse(emailListRaw) : [];
    if (!emailList.includes(normalizedEmail)) {
      emailList.push(normalizedEmail);
      await env.Q63_TRACKER.put('emails:list', JSON.stringify(emailList));
    }

    // Auto-login: generate session token
    const tokenArray = new Uint8Array(32);
    crypto.getRandomValues(tokenArray);
    const token = Array.from(tokenArray).map(b => b.toString(16).padStart(2, '0')).join('');

    const session = {
      email: normalizedEmail,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    };

    await env.Q63_TRACKER.put(`session:${token}`, JSON.stringify(session), {
      expirationTtl: 30 * 24 * 60 * 60,
    });

    return json({
      success: true,
      token,
      user: { email: normalizedEmail, name: name.trim() },
    });
  } catch (err) {
    return json({ error: 'Registration failed. Please try again.' }, 500);
  }
}
