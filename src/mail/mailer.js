const nodemailer = require("nodemailer");

const {
  SMTP_ADDRESS,
  SMTP_PORT,
  SMTP_USERNAME,
  SMTP_PASSWORD,
  SMTP_ENABLE_STARTTLS_AUTO,
  SMTP_SSL,
  MAILER_SENDER_EMAIL,
} = process.env;

/**
 * Transporter configurado para Gmail (porta 587 com STARTTLS)
 */
const transporter = nodemailer.createTransport({
  host: SMTP_ADDRESS || "smtp.gmail.com",
  port: Number(SMTP_PORT || 587),
  secure: SMTP_SSL === "true", // false para STARTTLS na porta 587
  auth: {
    user: SMTP_USERNAME,
    pass: SMTP_PASSWORD,
  },
  tls: {
    rejectUnauthorized: false,
    ciphers: "SSLv3",
  },
});

/**
 * Testa conexão ao iniciar
 */
transporter.verify((err, success) => {
  if (err) {
    console.error("[SMTP] Erro ao conectar no servidor SMTP:", err);
  } else {
    console.log("[SMTP] Conexão estabelecida com sucesso.");
  }
});

/**
 * Função geral de envio
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
    });

    console.log("[SMTP] E-mail enviado:", info.messageId);
    return info;
  } catch (err) {
    console.error("[SMTP] Falha ao enviar e-mail:", err);
    throw err;
  }
}

/**
 * E-mail de recuperação de senha
 */
async function sendPasswordRecoveryMail(email, token) {
  const resetLink = `https://app.micheledeiansa.com.br/reset-password?token=${encodeURIComponent(
    token
  )}`;

  const subject = "Recuperação de senha - NF Sistema";
  const html = `
    <p>Olá,</p>
    <p>Você solicitou a recuperação de senha do painel NF Sistema.</p>
    <p>Clique no link abaixo para redefinir sua senha:</p>
    <p><a href="${resetLink}">${resetLink}</a></p>
    <p>Se você não solicitou isso, apenas ignore este e-mail.</p>
  `;

  await sendMail({
    to: email,
    subject,
    html,
    text: `Link para redefinir sua senha: ${resetLink}`,
  });
}

module.exports = {
  sendMail,
  sendPasswordRecoveryMail,
};
