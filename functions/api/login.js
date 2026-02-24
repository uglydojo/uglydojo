// POST /api/login — Authenticate user
// Body: { email, password }

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

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export async function onRequestPost({ request, env }) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return json({ error: 'Email and password are required.' }, 400);
    }

    if (password.length > 256) {
      return json({ error: 'Invalid email or password.' }, 401);
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Look up user
    const userRaw = await env.Q63_TRACKER.get(`user:${normalizedEmail}`);
    if (!userRaw) {
      return json({ error: 'Invalid email or password.' }, 401);
    }

    const user = JSON.parse(userRaw);

    // Verify password
    const passwordHash = await hashPassword(password, user.salt);
    if (!timingSafeEqual(passwordHash, user.passwordHash)) {
      return json({ error: 'Invalid email or password.' }, 401);
    }

    // Generate session token
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
      user: { email: normalizedEmail, name: user.name },
    });
  } catch (err) {
    return json({ error: 'Login failed. Please try again.' }, 500);
  }
}
