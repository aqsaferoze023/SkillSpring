import { env } from '../config/env.js';

/**
 * Server-only transactional email adapter.
 * Uses Resend today; callers are isolated from provider-specific details.
 */
export async function sendInstructorInvitationEmail({ email, inviteUrl, inviterName }) {
  if (!env.emailApiKey) {
    if (process.env.NODE_ENV !== 'production') return { developmentPreview: true };
    throw Object.assign(new Error('Invitation email service is not configured'), { status: 503 });
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.emailApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env.emailFrom,
      to: [email],
      subject: 'You are invited to teach on SkillSpring',
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#10231c"><h1>Teach on SkillSpring</h1><p>${inviterName} invited you to become a SkillSpring instructor.</p><p>This invitation expires in 7 days. Sign in or create a student account using <strong>${email}</strong>, then accept the invitation.</p><p><a href="${inviteUrl}" style="display:inline-block;padding:12px 20px;background:#12895e;color:white;text-decoration:none;border-radius:10px">Accept invitation</a></p><p style="color:#64748b;font-size:12px">If you were not expecting this invitation, you can ignore this email.</p></div>`
    })
  });
  if (!response.ok) {
  const errorData = await response.json().catch(() => ({}));

  console.error('RESEND ERROR:', errorData);

  throw Object.assign(
    new Error(errorData?.message || 'Could not send invitation email'),
    { status: 502 }
  );
}
  return response.json();
}
