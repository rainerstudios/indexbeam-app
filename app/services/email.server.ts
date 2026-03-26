/**
 * Email service using Mailgun API (no SDK, simple HTTP POST)
 */

const MAILGUN_API_BASE = "https://api.mailgun.net/v3";

interface WeeklyDigestStats {
  urlsSubmitted: number;
  urlsIndexed: number;
  totalTracked: number;
  aiKeywordsChecked: number;
  aiKeywordsMentioned: number;
  aiSessions: number;
  topAISources: { source: string; sessions: number }[];
}

function buildDigestHtml(storeDomain: string, stats: WeeklyDigestStats, unsubscribeUrl: string): string {
  const mentionRate = stats.aiKeywordsChecked > 0
    ? Math.round((stats.aiKeywordsMentioned / stats.aiKeywordsChecked) * 100)
    : 0;
  const indexRate = stats.totalTracked > 0
    ? Math.round((stats.urlsIndexed / stats.totalTracked) * 100)
    : 0;

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f6f6f7">
<div style="max-width:600px;margin:0 auto;padding:20px">
  <div style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1)">
    <!-- Header -->
    <div style="background:#1a1a2e;padding:24px 32px">
      <h1 style="margin:0;color:#fff;font-size:20px">IndexBeam Weekly Report</h1>
      <p style="margin:4px 0 0;color:#a0a0b0;font-size:14px">${storeDomain}</p>
    </div>

    <!-- Stats Grid -->
    <div style="padding:24px 32px">
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
        <tr>
          <td style="padding:12px;text-align:center;border:1px solid #e5e5e5;border-radius:8px">
            <div style="font-size:28px;font-weight:700;color:#1a1a2e">${stats.urlsSubmitted}</div>
            <div style="font-size:12px;color:#666;margin-top:4px">URLs Submitted</div>
          </td>
          <td style="padding:12px;text-align:center;border:1px solid #e5e5e5;border-radius:8px">
            <div style="font-size:28px;font-weight:700;color:#1a1a2e">${indexRate}%</div>
            <div style="font-size:12px;color:#666;margin-top:4px">Index Rate</div>
          </td>
        </tr>
        <tr>
          <td style="padding:12px;text-align:center;border:1px solid #e5e5e5;border-radius:8px">
            <div style="font-size:28px;font-weight:700;color:${mentionRate > 0 ? '#16a34a' : '#1a1a2e'}">${mentionRate}%</div>
            <div style="font-size:12px;color:#666;margin-top:4px">AI Mention Rate</div>
          </td>
          <td style="padding:12px;text-align:center;border:1px solid #e5e5e5;border-radius:8px">
            <div style="font-size:28px;font-weight:700;color:#1a1a2e">${stats.aiSessions}</div>
            <div style="font-size:12px;color:#666;margin-top:4px">AI Sessions</div>
          </td>
        </tr>
      </table>

      <!-- Details -->
      <div style="margin-top:20px;padding:16px;background:#f9fafb;border-radius:8px">
        <h3 style="margin:0 0 12px;font-size:14px;color:#333">This Week's Summary</h3>
        <table width="100%" style="font-size:13px;color:#444">
          <tr><td style="padding:4px 0">URLs submitted for indexing</td><td style="text-align:right;font-weight:600">${stats.urlsSubmitted}</td></tr>
          <tr><td style="padding:4px 0">URLs currently indexed</td><td style="text-align:right;font-weight:600">${stats.urlsIndexed} / ${stats.totalTracked}</td></tr>
          <tr><td style="padding:4px 0">AI keywords checked</td><td style="text-align:right;font-weight:600">${stats.aiKeywordsChecked}</td></tr>
          <tr><td style="padding:4px 0">Keywords where AI mentions you</td><td style="text-align:right;font-weight:600">${stats.aiKeywordsMentioned}</td></tr>
          <tr><td style="padding:4px 0">Sessions from AI platforms</td><td style="text-align:right;font-weight:600">${stats.aiSessions}</td></tr>
        </table>
      </div>

      ${stats.topAISources.length > 0 ? `
      <div style="margin-top:16px;padding:16px;background:#f0fdf4;border-radius:8px">
        <h3 style="margin:0 0 8px;font-size:14px;color:#166534">Top AI Traffic Sources</h3>
        ${stats.topAISources.map(s => `<div style="font-size:13px;padding:2px 0"><span style="color:#444">${s.source}</span> <span style="float:right;font-weight:600">${s.sessions} sessions</span></div>`).join('')}
      </div>` : ''}

      <!-- CTA -->
      <div style="margin-top:24px;text-align:center">
        <a href="https://${storeDomain}/admin/apps/indexbeam" style="display:inline-block;padding:12px 24px;background:#1a1a2e;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px">View Full Dashboard</a>
      </div>
    </div>

    <!-- Footer -->
    <div style="padding:16px 32px;background:#f9fafb;border-top:1px solid #e5e5e5">
      <p style="margin:0;font-size:11px;color:#999;text-align:center">
        Sent by IndexBeam AI &middot;
        <a href="${unsubscribeUrl}" style="color:#999">Unsubscribe</a>
      </p>
    </div>
  </div>
</div>
</body>
</html>`;
}

export async function sendWeeklyDigest(
  email: string,
  storeDomain: string,
  stats: WeeklyDigestStats,
  unsubscribeToken: string,
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const apiKey = process.env.MAILGUN_API_KEY;
  const domain = process.env.MAILGUN_DOMAIN;

  if (!apiKey || !domain) {
    return { success: false, error: "Mailgun not configured" };
  }

  const appUrl = process.env.APP_URL || `https://${domain}`;
  const unsubscribeUrl = `${appUrl}/api/unsubscribe?token=${unsubscribeToken}`;

  const html = buildDigestHtml(storeDomain, stats, unsubscribeUrl);

  const formData = new FormData();
  formData.append("from", `IndexBeam Reports <reports@${domain}>`);
  formData.append("to", email);
  formData.append("subject", `Your Weekly IndexBeam Report — ${storeDomain}`);
  formData.append("html", html);
  formData.append("h:List-Unsubscribe", `<${unsubscribeUrl}>`);

  try {
    const response = await fetch(`${MAILGUN_API_BASE}/${domain}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`api:${apiKey}`).toString("base64")}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const text = await response.text();
      return { success: false, error: `Mailgun ${response.status}: ${text}` };
    }

    const data: any = await response.json();
    return { success: true, messageId: data.id };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}
