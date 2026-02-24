// POST /api/reset-request — Send password reset email
// Body: { email }

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

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export async function onRequestPost({ request, env }) {
  try {
    const { email } = await request.json();

    if (!email) {
      return json({ error: 'Email is required.' }, 400);
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Always return success to prevent email enumeration
    const successResponse = json({
      success: true,
      message: 'If an account exists with that email, a reset link has been sent.',
    });

    // Check if user exists
    const userRaw = await env.Q63_TRACKER.get(`user:${normalizedEmail}`);
    if (!userRaw) {
      return successResponse;
    }

    // Generate reset token
    const tokenArray = new Uint8Array(32);
    crypto.getRandomValues(tokenArray);
    const resetToken = Array.from(tokenArray).map(b => b.toString(16).padStart(2, '0')).join('');

    // Store reset token with 1-hour TTL
    await env.Q63_TRACKER.put(
      `reset:${resetToken}`,
      JSON.stringify({
        email: normalizedEmail,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      }),
      { expirationTtl: 3600 }
    );

    // Build reset URL
    const url = new URL(request.url);
    const resetUrl = `${url.origin}/Q63_Tracker.html#reset-confirm?token=${resetToken}`;

    // Send email via Resend
    if (env.RESEND_API_KEY) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Ugly Dojo <noreply@uglydojo.com>',
          to: [normalizedEmail],
          subject: 'Reset Your Q63 Tracker Password',
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; background: #000; color: #fff; padding: 40px; border-radius: 8px;">
              <h1 style="color: #ffcc00; font-size: 24px; margin-bottom: 20px;">UGLY DOJO</h1>
              <p style="color: #ccc; margin-bottom: 20px;">You requested a password reset for your Q63 Tracker account.</p>
              <a href="${resetUrl}" style="display: inline-block; background: #ffcc00; color: #000; padding: 12px 24px; text-decoration: none; font-weight: bold; border-radius: 4px;">Reset Password</a>
              <p style="color: #666; font-size: 12px; margin-top: 30px;">This link expires in 1 hour. If you didn't request this, ignore this email.</p>
            </div>
          `,
        }),
      });
    }

    return successResponse;
  } catch (err) {
    return json({ error: 'Request failed. Please try again.' }, 500);
  }
}
