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
    html: html || `<p>${text}</p>`,
  });
};
