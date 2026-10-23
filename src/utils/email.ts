import { env } from '@/config/env';
import nodemailer, { type Transporter } from 'nodemailer';

let transporter: Transporter | null = null;

if (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
  });
}

interface SendEmailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export const sendEmail = async ({
  to,
  subject,
  text,
  html,
}: SendEmailOptions) => {
  if (!transporter) {
    console.log(
      '\n================ [EMAIL SERVICE (DEV MOCK)] ================',
    );
    console.log(`To:      ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(`Body:    ${text}`);
    console.log(
      '============================================================\n',
    );
    return;
  }

  await transporter?.sendMail({
    from: env.EMAIL_FROM,
    to,
    subject,
    html:
      html ||
      `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0;
  border-radius: 8px;">
            <h2 style="color: #333;">Searchy</h2>
            <p style="font-size: 16px; color: #555; white-space: pre-line;">${text}</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
            <p style="font-size: 12px; color: #999;">If you didn't request this email, you can safely ignore it.</p>
          </div>
        `,
  });
};
