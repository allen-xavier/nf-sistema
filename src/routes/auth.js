const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { SystemUser } = require("../models");

const router = express.Router();

/**
 * POST /api/auth/login
 * Body:
 * {
 *   email: "",
 *   password: ""
 * }
 */
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ error: "E-mail e senha são obrigatórios." });
    }

    const user = await SystemUser.findOne({
      where: { email },
    });

    if (!user) {
      return res
        .status(401)
        .json({ error: "Credenciais inválidas." });
    }

    const ok = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!ok) {
      return res
        .status(401)
        .json({ error: "Credenciais inválidas." });
    }

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        is_admin: user.is_admin,
      },
      process.env.JWT_SECRET || "default_secret_token",
      {
        expiresIn: "24h",
      }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        is_admin: user.is_admin,
      },
    });
  } catch (err) {
    console.error("Erro no login:", err);
    res
      .status(500)
      .json({ error: "Erro ao fazer login." });
  }
});

/**
 * GET /api/auth/me
 * Retorna dados do usuário autenticado
 * (usado apenas se você quiser consultar no front)
 */
router.get("/me", async (req, res) => {
  try {
    const header = req.headers.authorization;

    if (!header) {
      return res.status(401).json({ error: "Token ausente." });
    }

    const [, token] = header.split(" ");

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "default_secret_token"
    );

    const user = await SystemUser.findByPk(decoded.id, {
      attributes: ["id", "name", "email", "is_admin"],
    });

    if (!user) {
      return res
        .status(404)
        .json({ error: "Usuário não encontrado." });
    }

    res.json(user);
  } catch (err) {
    console.error("Erro no /me:", err);
    res
      .status(401)
      .json({ error: "Token inválido ou expirado." });
  }
});

module.exports = router;
