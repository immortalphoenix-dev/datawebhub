/**
 * Email notification service using Resend
 * Sends notifications when a potential deal is detected
 */

export async function sendDealNotification(clientMessage: string, sessionId: string): Promise<boolean> {
  try {
    const apiKey = process.env.RESEND_API_KEY;
    const recipientEmail = process.env.VITE_USER_EMAIL || "thedatawebhub@gmail.com";

    if (!apiKey) {
      console.warn('RESEND_API_KEY not configured, skipping email notification');
      return false;
    }

    const emailContent = `
<!DOCTYPE html>
<html>
  <head>
    <style>
      body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
      .container { max-width: 600px; margin: 0 auto; padding: 20px; }
      .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0; }
      .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 8px 8px; }
      .alert { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 4px; }
      .message-box { background: white; padding: 15px; border-left: 4px solid #667eea; margin: 15px 0; border-radius: 4px; }
      .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; }
      a { color: #667eea; text-decoration: none; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1>🔔 Potential Deal Alert</h1>
      </div>
      <div class="content">
        <p>Hey Romeo! A visitor is showing strong interest in your services.</p>
        
        <div class="alert">
          <strong>⚡ Action Required:</strong> This person mentioned keywords like hiring, projects, or working together. They might be ready to discuss a deal!
        </div>
        
        <h3>Their Message:</h3>
        <div class="message-box">
          <p><strong>"${clientMessage.substring(0, 200)}${clientMessage.length > 200 ? '...' : ''}"</strong></p>
        </div>
        
        <h3>Next Steps:</h3>
        <ol>
          <li>Check your portfolio chat (Session: ${sessionId})</li>
          <li>Follow up with them via email or contact method they provided</li>
          <li>Discuss scope and pricing</li>
        </ol>
        
        <div class="footer">
          <p>This is an automated notification from your portfolio AI assistant Romeo.</p>
          <p>If you're seeing too many alerts, you can adjust the deal detection keywords in your code.</p>
        </div>
      </div>
    </div>
  </body>
</html>
    `;

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: "Romeo <onboarding@resend.dev>",
        to: recipientEmail,
        subject: "🔔 Potential Deal Alert - Portfolio Chat",
        html: emailContent,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Resend API error:", error);
      return false;
    }

    const data = await response.json();
    console.log("✅ Deal notification email sent successfully:", data.id);
    return true;
  } catch (error) {
    console.error("Error sending deal notification email:", error);
    return false;
  }
}
