// Email Delivery Service boundary (UC-1.3). Without SMTP configured, the reset link is printed to the
// server console for local development — it is never returned in an API response.
import { config } from '../config.js';

export interface OutgoingMail {
  to: string;
  subject: string;
  text: string;
}

/** Test hook: captured messages (only populated in tests). */
export const testOutbox: OutgoingMail[] = [];

export async function sendMail(mail: OutgoingMail): Promise<void> {
  if (config.isTest) {
    testOutbox.push(mail);
    return;
  }
  if (!config.mail.smtpUrl) {
    console.log(`\n[mail:dev] To: ${mail.to}\n[mail:dev] Subject: ${mail.subject}\n${mail.text}\n`);
    return;
  }
  // SMTP delivery can be added with nodemailer when a provider is chosen; keep the boundary here.
  console.warn('[mail] SMTP_URL is set but no SMTP transport is bundled in this prototype; printing instead.');
  console.log(`[mail:dev] To: ${mail.to}\n${mail.text}`);
}
