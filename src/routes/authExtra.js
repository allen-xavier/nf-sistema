const express = require("express");
const bcrypt = require("bcryptjs");
const { SystemUser, PasswordResetToken, sequelize } = require("../models");
const { sendPasswordRecoveryMail } = require("../mail/mailer");
const { generateToken, hashToken } = require("../utils/tokens");
const { audit } = require("../middleware/audit");

const router = express.Router();

/**
 * POST /api/auth/forgot-password
 * Body:
 * {
 *   "email": "admin@exemplo.com"
 * }
 *
 * Observação:
 *     Por segurança SEMPRE retorna sucesso,
 *     mesmo que o e-mail não exista.
 */
router.post("/forgot-password", async (req, res) => {
  try {
    const email = String(req.body.email || "").trim();

    if (!email) {
      return res
        .status(400)
        .json({ error: "Informe o e-mail." });
    }

    const user = await SystemUser.findOne({
      where: { email },
    });

    if (user && user.status === "ACTIVE") {
      await PasswordResetToken.update(
        { status: "REVOKED" },
        { where: { user_id: user.id, status: "PENDING" } }
      );

      const token = generateToken();
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

      await PasswordResetToken.create({
        user_id: user.id,
        token_hash: hashToken(token),
        status: "PENDING",
        expires_at: expiresAt,
      });

      const appUrl = (process.env.APP_URL || `${req.protocol}://${req.get("host")}`).replace(/\/$/, "");
      const resetUrl = `${appUrl}/reset-password?token=${encodeURIComponent(token)}`;

      try {
        await sendPasswordRecoveryMail(email, resetUrl);
      } catch (mailErr) {
        console.error("[FORGOT-PASSWORD] Falha ao enviar e-mail:", mailErr.message);
      }
    }

    return res.json({
      success: true,
      message:
        "Se o e-mail existir, um link de recuperação foi enviado.",
    });
  } catch (err) {
    console.error("Erro em forgot-password:", err);
    return res
      .status(500)
      .json({ error: "Erro ao processar recuperação de senha." });
  }
});

/**
 * GET /api/auth/reset-password-info?token=xxx
 * Valida o link sem revelar a conta associada.
 */
router.get("/reset-password-info", async (req, res) => {
  try {
    const token = String(req.query.token || "");
    if (!token) return res.status(400).json({ error: "Token ausente." });

    const reset = await PasswordResetToken.findOne({
      where: { token_hash: hashToken(token) },
    });

    if (!reset || reset.status !== "PENDING" || new Date() > reset.expires_at) {
      return res.status(400).json({ error: "Link inválido ou expirado." });
    }

    res.json({ valid: true, expires_at: reset.expires_at });
  } catch (err) {
    console.error("Erro ao validar recuperação de senha:", err);
    res.status(500).json({ error: "Erro ao validar o link." });
  }
});

/**
 * POST /api/auth/reset-password
 * Body: { token, password, password_confirmation }
 */
router.post("/reset-password", async (req, res) => {
  try {
    const { token, password, password_confirmation } = req.body;

    if (!token || !password) {
      return res.status(400).json({ error: "Token e senha são obrigatórios." });
    }
    if (password !== password_confirmation) {
      return res.status(400).json({ error: "Senhas não conferem." });
    }
    if (password.length < 8 || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
      return res.status(400).json({
        error: "A senha deve ter pelo menos 8 caracteres, com letras e números.",
      });
    }

    const tokenHash = hashToken(token);
    const reset = await PasswordResetToken.findOne({ where: { token_hash: tokenHash } });

    if (!reset || reset.status !== "PENDING" || new Date() > reset.expires_at) {
      if (reset && reset.status === "PENDING") {
        reset.status = "EXPIRED";
        await reset.save();
      }
      return res.status(400).json({ error: "Link inválido ou expirado." });
    }

    const user = await SystemUser.findByPk(reset.user_id);
    if (!user || user.status !== "ACTIVE") {
      return res.status(400).json({ error: "Não foi possível redefinir a senha." });
    }

    await sequelize.transaction(async (transaction) => {
      user.password_hash = await bcrypt.hash(password, 10);
      await user.save({ transaction });

      reset.status = "USED";
      reset.used_at = new Date();
      await reset.save({ transaction });

      await PasswordResetToken.update(
        { status: "REVOKED" },
        {
          where: { user_id: user.id, status: "PENDING" },
          transaction,
        }
      );
    });

    await audit(user.id, "RESET_PASSWORD", "SystemUser", user.id, {}, req);
    res.json({ success: true });
  } catch (err) {
    console.error("Erro ao redefinir senha:", err);
    res.status(500).json({ error: "Erro ao redefinir senha." });
  }
});

module.exports = router;
