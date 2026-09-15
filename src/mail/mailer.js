const nodemailer = require("nodemailer");

const {
  SMTP_ADDRESS,
  SMTP_PORT,
  SMTP_USERNAME,
  SMTP_PASSWORD,
  MAILER_SENDER_EMAIL,
} = process.env;

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Transporter correto para Gmail com STARTTLS na porta 587
 */
const transporter = nodemailer.createTransport({
  host: SMTP_ADDRESS || "smtp.gmail.com",
  port: Number(SMTP_PORT || 587),
  secure: false, // IMPORTANTÍSSIMO: SEMPRE false para porta 587
  auth: {
    user: SMTP_USERNAME,
    pass: SMTP_PASSWORD,
  },
  tls: {
    rejectUnauthorized: process.env.SMTP_ALLOW_INVALID_CERT === "1" ? false : true,
  },
});

if (process.env.SMTP_VERIFY_ON_START === "1") {
  transporter.verify((err) => {
    if (err) {
      console.error("[SMTP] Erro ao conectar no servidor SMTP:", err);
    } else {
      console.log("[SMTP] Conexão SMTP estabelecida com sucesso.");
    }
  });
}

/**
 * Envio genérico
 */
async function sendMail({ to, subject, text, html }) {
  try {
    const from = MAILER_SENDER_EMAIL || SMTP_USERNAME;

    const info = await transporter.sendMail({
      from,
      to,
      subject,
      text,
      html,
      disableFileAccess: true,
      disableUrlAccess: true,
    });

    console.log("[SMTP] E-mail enviado:", info.messageId);
    return info;
  } catch (err) {
    console.error("[SMTP] Falha ao enviar e-mail:", err);
    throw err;
  }
}

/**
 * Envio do e-mail de recuperação
 */
async function sendPasswordRecoveryMail(email, resetLink) {
  const safeResetLink = escapeHtml(resetLink);
  const subject = "Recuperação de senha - NF Sistema";
  const html = `
    <p>Olá,</p>
    <p>Você solicitou a recuperação de senha do painel NF Sistema.</p>
    <p>Clique no link abaixo para redefinir sua senha:</p>
    <p><a href="${safeResetLink}">${safeResetLink}</a></p>
    <p>Se você não solicitou isso, apenas ignore este e-mail.</p>
  `;

  await sendMail({
    to: email,
    subject,
    html,
    text: `Redefina sua senha no link: ${resetLink}`,
  });
}

/**
 * Envio do e-mail de ativação de conta
 */
async function sendActivationMail(email, name, activationUrl) {
  const safeName = escapeHtml(name);
  const safeActivationUrl = escapeHtml(activationUrl);
  const subject = "Ative sua conta - NF Sistema";
  const html = `
    <p>Olá, <strong>${safeName}</strong>!</p>
    <p>Você foi convidado para o NF Sistema.</p>
    <p>Clique no link abaixo para definir sua senha e ativar sua conta:</p>
    <p><a href="${safeActivationUrl}" style="display:inline-block;padding:10px 20px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;">Ativar minha conta</a></p>
    <p style="font-size:12px;color:#6b7280;margin-top:16px;">Este link é válido por 24 horas e só pode ser usado uma vez.</p>
    <p style="font-size:12px;color:#6b7280;">Se você não solicitou isso, ignore este e-mail.</p>
  `;

  await sendMail({
    to: email,
    subject,
    html,
    text: `Olá ${name}, ative sua conta em: ${activationUrl}`,
  });
}

module.exports = {
  sendMail,
  sendPasswordRecoveryMail,
  sendActivationMail,
};
