import { afterEach, describe, expect, it, vi } from 'vitest';
import nodemailer from 'nodemailer';
import { config } from '../src/config.js';
import { sendMail, testOutbox } from '../src/account/mailer.js';

vi.mock('nodemailer', () => ({ default: { createTransport: vi.fn() } }));
const original = { isTest: config.isTest, smtpUrl: config.mail.smtpUrl };
afterEach(() => {
  config.isTest = original.isTest;
  config.mail.smtpUrl = original.smtpUrl;
  testOutbox.length = 0;
  vi.restoreAllMocks();
});
const mail = { to: 'fixture@example.com', subject: 'Fixture reset', text: 'Fixture email body' };

describe('password-reset email boundary', () => {
  it('captures test email without contacting an external service', async () => {
    config.isTest = true;
    await sendMail(mail);
    expect(testOutbox).toEqual([mail]);
  });
  it('fails clearly without SMTP and never prints the email to logs', async () => {
    config.isTest = false;
    config.mail.smtpUrl = '';
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await expect(sendMail(mail)).rejects.toThrow('Password-reset email is not configured');
    expect(log).not.toHaveBeenCalled();
  });
  it('uses the configured SMTP transport and closes it', async () => {
    config.isTest = false;
    config.mail.smtpUrl = 'smtp://localhost:1025';
    const send = vi.fn().mockResolvedValue({});
    const close = vi.fn();
    vi.mocked(nodemailer.createTransport).mockReturnValue({ sendMail: send, close } as unknown as ReturnType<typeof nodemailer.createTransport>);
    await sendMail(mail);
    expect(send).toHaveBeenCalledWith(mail);
    expect(close).toHaveBeenCalledOnce();
  });
  it('closes the transport on delivery failure without logging private content', async () => {
    config.isTest = false;
    config.mail.smtpUrl = 'smtp://localhost:1025';
    const close = vi.fn();
    vi.mocked(nodemailer.createTransport).mockReturnValue({ sendMail: vi.fn().mockRejectedValue(new Error('SMTP unavailable')), close } as unknown as ReturnType<typeof nodemailer.createTransport>);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await expect(sendMail(mail)).rejects.toThrow('SMTP unavailable');
    expect(close).toHaveBeenCalledOnce();
    expect(log).not.toHaveBeenCalled();
  });
});
