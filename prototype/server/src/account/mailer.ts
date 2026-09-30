// Email Delivery Service boundary (UC-1.3). Reset links are never logged.
import nodemailer from 'nodemailer';
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
    throw new Error('Password-reset email is not configured.');
  }
  const transport = nodemailer.createTransport(config.mail.smtpUrl, {
    from: config.mail.from,
  });
  try {
    await transport.sendMail(mail);
  } finally {
    transport.close();
  }
}
