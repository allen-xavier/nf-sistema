const jwt = require("jsonwebtoken");

/**
 * Middleware padrão de autenticação.
 * Verifica se o token JWT é válido.
 */
function authMiddleware(req, res, next) {
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

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "default_secret_token"
    );

    req.user = decoded; // {id, email, is_admin}

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
