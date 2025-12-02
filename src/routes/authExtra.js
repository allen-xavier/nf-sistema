const express = require("express");
const crypto = require("crypto");
const { SystemUser } = require("../models");
const { sendPasswordRecoveryMail } = require("../mail/mailer");

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
    const { email } = req.body;

    if (!email) {
      return res
        .status(400)
        .json({ error: "Informe o e-mail." });
    }

    const user = await SystemUser.findOne({
      where: { email },
    });

    // Gera token independente do usuário existir ou não
    const token = crypto.randomBytes(32).toString("hex");

    // Apenas log (para depuração / implantação)
    console.log(
      `[FORGOT-PASSWORD] Token de recuperação para ${email}: ${token}`
    );

    if (user) {
      // envio real do e-mail
      await sendPasswordRecoveryMail(email, token);
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

module.exports = router;
