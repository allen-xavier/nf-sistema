const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { SystemUser, UserInvitation } = require("../models");
const { audit } = require("../middleware/audit");
const { authMiddleware } = require("../middleware/auth");
const { hashToken } = require("../utils/tokens");
const { getJwtSecret, getJwtExpiresIn } = require("../config/security");
const { getAccessibleCompanies, publicUser } = require("../utils/companyAccess");

const router = express.Router();

const loginFailures = new Map();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 10;

function loginAttemptKey(req, email) {
  return `${req.ip}:${String(email || "").trim().toLowerCase()}`;
}

function isLoginBlocked(key) {
  const entry = loginFailures.get(key);
  if (!entry) return false;
  if (Date.now() - entry.startedAt >= LOGIN_WINDOW_MS) {
    loginFailures.delete(key);
    return false;
  }
  return entry.count >= LOGIN_MAX_FAILURES;
}

function registerLoginFailure(key) {
  const current = loginFailures.get(key);
  if (!current || Date.now() - current.startedAt >= LOGIN_WINDOW_MS) {
    loginFailures.set(key, { count: 1, startedAt: Date.now() });
  } else {
    current.count += 1;
  }

  if (loginFailures.size > 5000) {
    const now = Date.now();
    for (const [entryKey, entry] of loginFailures) {
      if (now - entry.startedAt >= LOGIN_WINDOW_MS) loginFailures.delete(entryKey);
    }
    while (loginFailures.size > 5000) {
      loginFailures.delete(loginFailures.keys().next().value);
    }
  }
}

/**
 * POST /api/auth/login
 */
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "E-mail e senha são obrigatórios." });
    }

    const attemptKey = loginAttemptKey(req, email);
    if (isLoginBlocked(attemptKey)) {
      return res.status(429).json({
        error: "Muitas tentativas de acesso. Aguarde alguns minutos.",
      });
    }

    const user = await SystemUser.findOne({ where: { email } });

    if (!user) {
      registerLoginFailure(attemptKey);
      await audit(null, 'LOGIN_FAILED', 'SystemUser', null, { email, reason: 'not_found' }, req);
      return res.status(401).json({ error: "Credenciais inválidas." });
    }

    if (user.status === 'PENDING') {
      return res.status(401).json({ error: "Conta ainda não ativada. Verifique seu e-mail." });
    }

    if (user.status === 'DISABLED') {
      return res.status(401).json({ error: "Conta desativada. Contate o administrador." });
    }

    if (!user.password_hash) {
      return res.status(401).json({ error: "Conta ainda não ativada." });
    }

    const ok = await bcrypt.compare(password, user.password_hash);

    if (!ok) {
      registerLoginFailure(attemptKey);
      await audit(user.id, 'LOGIN_FAILED', 'SystemUser', user.id, { reason: 'wrong_password' }, req);
      return res.status(401).json({ error: "Credenciais inválidas." });
    }

    // Atualizar last_login_at
    user.last_login_at = new Date();
    await user.save();
    loginFailures.delete(attemptKey);

    const token = jwt.sign(
      { id: user.id, email: user.email, is_admin: user.is_admin },
      getJwtSecret(),
      { expiresIn: getJwtExpiresIn() }
    );

    await audit(user.id, 'LOGIN', 'SystemUser', user.id, {}, req);

    const companies = await getAccessibleCompanies(user.id);

    res.json({
      token,
      user: publicUser(user, companies),
    });
  } catch (err) {
    console.error("Erro no login:", err);
    res.status(500).json({ error: "Erro ao fazer login." });
  }
});

/**
 * GET /api/auth/me
 */
router.get("/me", authMiddleware, async (req, res) => {
  try {
    const user = await SystemUser.findByPk(req.user.id, {
      attributes: ["id", "name", "email", "is_admin", "status", "default_company_id"],
    });

    if (!user) return res.status(404).json({ error: "Usuário não encontrado." });

    res.json(publicUser(user, req.user.companies || []));
  } catch (err) {
    console.error("Erro ao consultar usuário autenticado:", err);
    res.status(500).json({ error: "Erro ao consultar usuário." });
  }
});

/**
 * GET /api/auth/activate-info?token=xxx
 * Retorna informações públicas do convite (para exibir na tela de ativação)
 */
router.get("/activate-info", async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).json({ error: "Token ausente." });

    const tokenHash = hashToken(token);

    const invitation = await UserInvitation.findOne({
      where: { token_hash: tokenHash },
    });

    if (!invitation) {
      return res.status(404).json({ error: "Convite não encontrado." });
    }

    if (invitation.status !== 'PENDING') {
      return res.status(400).json({ error: "Convite já utilizado ou revogado." });
    }

    if (new Date() > invitation.expires_at) {
      return res.status(400).json({ error: "Convite expirado." });
    }

    if (invitation.attempts >= 5) {
      return res.status(400).json({ error: "Convite bloqueado por tentativas." });
    }

    const user = await SystemUser.findByPk(invitation.user_id, {
      attributes: ['name', 'email'],
    });

    res.json({
      name: user?.name || '',
      email: invitation.email,
      expires_at: invitation.expires_at,
    });
  } catch (err) {
    console.error("Erro em activate-info:", err);
    res.status(500).json({ error: "Erro ao buscar informações." });
  }
});

/**
 * POST /api/auth/activate
 * Ativar conta com token de convite
 * Body: { token, password, password_confirmation }
 */
router.post("/activate", async (req, res) => {
  try {
    const { token, password, password_confirmation } = req.body;

    if (!token || !password) {
      return res.status(400).json({ error: "Token e senha são obrigatórios." });
    }

    if (password !== password_confirmation) {
      return res.status(400).json({ error: "Senhas não conferem." });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: "Senha deve ter pelo menos 8 caracteres." });
    }

    if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
      return res.status(400).json({ error: "Senha deve conter pelo menos 1 letra e 1 número." });
    }

    const tokenHash = hashToken(token);

    const invitation = await UserInvitation.findOne({
      where: { token_hash: tokenHash },
    });

    if (!invitation) {
      return res.status(404).json({ error: "Convite não encontrado." });
    }

    if (invitation.status !== 'PENDING') {
      return res.status(400).json({ error: "Convite já utilizado ou revogado." });
    }

    if (new Date() > invitation.expires_at) {
      invitation.status = 'EXPIRED';
      await invitation.save();
      return res.status(400).json({ error: "Convite expirado. Solicite um novo." });
    }

    if (invitation.attempts >= 5) {
      invitation.status = 'REVOKED';
      await invitation.save();
      return res.status(400).json({ error: "Convite bloqueado. Solicite um novo." });
    }

    // Hash a senha e ativar
    const passwordHash = await bcrypt.hash(password, 10);

    const user = await SystemUser.findByPk(invitation.user_id);
    if (!user) {
      return res.status(404).json({ error: "Usuário não encontrado." });
    }

    user.password_hash = passwordHash;
    user.status = 'ACTIVE';
    user.activated_at = new Date();
    await user.save();

    // Marcar convite como usado
    invitation.status = 'USED';
    invitation.used_at = new Date();
    await invitation.save();

    await audit(user.id, 'ACTIVATE_USER', 'SystemUser', user.id, {}, req);

    // Retornar JWT para login automático
    const jwtToken = jwt.sign(
      { id: user.id, email: user.email, is_admin: user.is_admin },
      getJwtSecret(),
      { expiresIn: getJwtExpiresIn() }
    );

    const companies = await getAccessibleCompanies(user.id);

    res.json({
      token: jwtToken,
      user: publicUser(user, companies),
    });
  } catch (err) {
    console.error("Erro na ativação:", err);
    res.status(500).json({ error: "Erro ao ativar conta." });
  }
});

/**
 * POST /api/auth/change-password
 * Body: { current_password, new_password }
 */
router.post("/change-password", authMiddleware, async (req, res) => {
  try {
    const user = await SystemUser.findByPk(req.user.id);
    if (!user) return res.status(404).json({ error: "Usuário não encontrado." });

    const { current_password, new_password } = req.body;

    if (!current_password || !new_password) {
      return res.status(400).json({ error: "Senha atual e nova são obrigatórias." });
    }

    const ok = await bcrypt.compare(current_password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: "Senha atual incorreta." });
    }

    if (new_password.length < 8) {
      return res.status(400).json({ error: "Nova senha deve ter pelo menos 8 caracteres." });
    }

    if (!/[a-zA-Z]/.test(new_password) || !/[0-9]/.test(new_password)) {
      return res.status(400).json({ error: "Nova senha deve conter pelo menos 1 letra e 1 número." });
    }

    user.password_hash = await bcrypt.hash(new_password, 10);
    await user.save();

    await audit(user.id, 'CHANGE_PASSWORD', 'SystemUser', user.id, {}, req);

    res.json({ success: true });
  } catch (err) {
    console.error("Erro ao trocar senha:", err);
    res.status(500).json({ error: "Erro ao trocar senha." });
  }
});

module.exports = router;
