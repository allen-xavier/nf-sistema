const jwt = require("jsonwebtoken");
const { SystemUser } = require("../models");
const { getJwtSecret } = require("../config/security");

/**
 * Middleware padrão de autenticação.
 * Verifica se o token JWT é válido.
 */
async function authMiddleware(req, res, next) {
  try {
    const header = req.headers.authorization;

    if (!header) {
      return res.status(401).json({
        error: "Token ausente. Faça login novamente.",
      });
    }

    const [, token] = header.split(" ");

    if (!token) {
      return res.status(401).json({
        error: "Token inválido ou mal formatado.",
      });
    }

    const decoded = jwt.verify(token, getJwtSecret());

    const user = await SystemUser.findByPk(decoded.id, {
      attributes: ["id", "email", "is_admin", "status"],
    });

    if (!user || user.status !== "ACTIVE") {
      return res.status(401).json({
        error: "Usuário inexistente ou desativado.",
      });
    }

    // Permissões são sempre obtidas do banco para que desativações e
    // alterações de perfil tenham efeito imediatamente.
    req.user = {
      ...decoded,
      id: user.id,
      email: user.email,
      is_admin: user.is_admin,
      status: user.status,
    };

    next();
  } catch (err) {
    console.error("[AUTH] Erro de autenticação:", err);

    return res.status(401).json({
      error: "Token inválido ou expirado.",
    });
  }
}

/**
 * Middleware para permitir apenas administradores.
 */
function adminOnly(req, res, next) {
  try {
    if (!req.user) {
      return res.status(401).json({
        error: "Token inválido.",
      });
    }

    if (req.user.is_admin !== true) {
      return res.status(403).json({
        error: "Acesso negado. Apenas administradores.",
      });
    }

    next();
  } catch (err) {
    console.error("[AUTH] Erro no adminOnly:", err);
    return res.status(500).json({
      error: "Erro interno na verificação de permissão.",
    });
  }
}

module.exports = {
  authMiddleware,
  adminOnly,
};
