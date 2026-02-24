// POST /api/reset-confirm — Reset password with token
// Body: { token, newPassword }

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
    { name: 'PBKDF2', salt: encoder.encode(salt), iterations: 100000, hash: 'SHA-256' },
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
    const { token, newPassword } = await request.json();

    if (!token || !newPassword) {
      return json({ error: 'Token and new password are required.' }, 400);
    }

    if (newPassword.length < 8 || newPassword.length > 256) {
      return json({ error: 'Password must be between 8 and 256 characters.' }, 400);
    }

    // Validate token format
    if (!/^[a-f0-9]{64}$/.test(token)) {
      return json({ error: 'Invalid reset token.' }, 400);
    }

    // Look up reset token
    const resetRaw = await env.Q63_TRACKER.get(`reset:${token}`);
    if (!resetRaw) {
      return json({ error: 'Invalid or expired reset link.' }, 400);
    }

    const resetData = JSON.parse(resetRaw);

    // Check expiration
    if (new Date(resetData.expiresAt) < new Date()) {
      await env.Q63_TRACKER.delete(`reset:${token}`);
      return json({ error: 'Reset link has expired. Please request a new one.' }, 400);
    }

    // Get user
    const userRaw = await env.Q63_TRACKER.get(`user:${resetData.email}`);
    if (!userRaw) {
      return json({ error: 'Account not found.' }, 404);
    }

    const user = JSON.parse(userRaw);

    // Update password
    const newSalt = generateSalt();
    const newHash = await hashPassword(newPassword, newSalt);
    user.passwordHash = newHash;
    user.salt = newSalt;

    await env.Q63_TRACKER.put(`user:${resetData.email}`, JSON.stringify(user));

    // Delete the reset token
    await env.Q63_TRACKER.delete(`reset:${token}`);

    return json({ success: true, message: 'Password has been reset. You can now log in.' });
  } catch (err) {
    return json({ error: 'Password reset failed. Please try again.' }, 500);
  }
}
