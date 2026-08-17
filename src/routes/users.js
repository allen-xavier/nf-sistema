const express = require('express');
const bcrypt = require('bcryptjs');
const { SystemUser, UserInvitation } = require('../models');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const { audit } = require('../middleware/audit');
const { generateToken, hashToken } = require('../utils/tokens');
const { sendActivationMail } = require('../mail/mailer');

const router = express.Router();

router.use(authMiddleware);
router.use(adminOnly);

/**
 * GET /api/users
 * Listar todos os usuários (sem dados sensíveis)
 */
router.get('/', async (req, res) => {
  try {
    const users = await SystemUser.findAll({
      attributes: ['id', 'name', 'email', 'is_admin', 'status', 'activated_at', 'last_login_at', 'created_at'],
      order: [['created_at', 'DESC']],
    });
    res.json(users);
  } catch (err) {
    console.error('Erro ao listar usuários:', err);
    res.status(500).json({ error: 'Erro ao listar usuários.' });
  }
});

/**
 * GET /api/users/:id
 */
router.get('/:id', async (req, res) => {
  try {
    const user = await SystemUser.findByPk(req.params.id, {
      attributes: ['id', 'name', 'email', 'is_admin', 'status', 'activated_at', 'last_login_at', 'created_at'],
    });
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });
    res.json(user);
  } catch (err) {
    console.error('Erro ao buscar usuário:', err);
    res.status(500).json({ error: 'Erro ao buscar usuário.' });
  }
});

/**
 * POST /api/users
 * Criar convite de novo usuário
 * Body: { name, email, is_admin }
 */
router.post('/', async (req, res) => {
  try {
    const { name, email, is_admin } = req.body;

    if (!name || !email) {
      return res.status(400).json({ error: 'Nome e e-mail são obrigatórios.' });
    }

    // Verificar duplicidade
    const existing = await SystemUser.findOne({ where: { email } });
    if (existing) {
      return res.status(400).json({ error: 'Já existe um usuário com esse e-mail.' });
    }

    // Criar usuário com status PENDING (sem senha)
    const user = await SystemUser.create({
      name,
      email,
      password_hash: null,
      is_admin: is_admin || false,
      status: 'PENDING',
    });

    // Gerar token de ativação
    const token = generateToken();
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

    await UserInvitation.create({
      user_id: user.id,
      email,
      token_hash: tokenHash,
      status: 'PENDING',
      expires_at: expiresAt,
      created_by_user_id: req.user.id,
      ip_address: req.ip,
    });

    // Tentar enviar e-mail
    const appUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    const activationUrl = `${appUrl}/?token=${token}`;

    let emailSent = false;
    try {
      await sendActivationMail(email, name, activationUrl);
      emailSent = true;
    } catch (mailErr) {
      console.error('[USERS] Falha ao enviar e-mail de ativação:', mailErr.message);
    }

    await audit(req.user.id, 'CREATE_USER', 'SystemUser', user.id, { email, is_admin: is_admin || false }, req);

    res.status(201).json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        is_admin: user.is_admin,
        status: user.status,
      },
      invitation: {
        email_sent: emailSent,
        activation_url: emailSent ? null : activationUrl,
        expires_at: expiresAt,
      },
    });
  } catch (err) {
    console.error('Erro ao criar usuário:', err);
    if (err.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({ error: 'E-mail já cadastrado.' });
    }
    res.status(500).json({ error: 'Erro ao criar usuário.' });
  }
});

/**
 * PUT /api/users/:id
 * Editar usuário (nome, is_admin, status)
 */
router.put('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const user = await SystemUser.findByPk(id);

    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

    // Admin não pode revogar próprio is_admin
    if (id === req.user.id && req.body.is_admin === false) {
      return res.status(400).json({ error: 'Você não pode revogar seu próprio acesso admin.' });
    }

    const { name, email, is_admin, status } = req.body;

    if (name) user.name = name;
    if (email) user.email = email;
    if (is_admin !== undefined) user.is_admin = is_admin;
    if (status) user.status = status;

    await user.save();

    await audit(req.user.id, 'UPDATE_USER', 'SystemUser', id, { name, email, is_admin, status }, req);

    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      is_admin: user.is_admin,
      status: user.status,
    });
  } catch (err) {
    console.error('Erro ao atualizar usuário:', err);
    res.status(500).json({ error: 'Erro ao atualizar usuário.' });
  }
});

/**
 * DELETE /api/users/:id
 */
router.delete('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (id === req.user.id) {
      return res.status(400).json({ error: 'Você não pode deletar a si mesmo.' });
    }

    const user = await SystemUser.findByPk(id);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

    await user.destroy();

    await audit(req.user.id, 'DELETE_USER', 'SystemUser', id, { email: user.email }, req);

    res.json({ success: true });
  } catch (err) {
    console.error('Erro ao deletar usuário:', err);
    res.status(500).json({ error: 'Erro ao deletar usuário.' });
  }
});

/**
 * POST /api/users/:id/resend-invite
 * Reenviar convite (gera novo token, invalida anterior)
 */
router.post('/:id/resend-invite', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const user = await SystemUser.findByPk(id);

    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });
    if (user.status !== 'PENDING') {
      return res.status(400).json({ error: 'Usuário já está ativo.' });
    }

    // Revogar convites anteriores
    await UserInvitation.update(
      { status: 'REVOKED' },
      { where: { user_id: id, status: 'PENDING' } }
    );

    // Novo token
    const token = generateToken();
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await UserInvitation.create({
      user_id: user.id,
      email: user.email,
      token_hash: tokenHash,
      status: 'PENDING',
      expires_at: expiresAt,
      created_by_user_id: req.user.id,
      ip_address: req.ip,
    });

    const appUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    const activationUrl = `${appUrl}/?token=${token}`;

    let emailSent = false;
    try {
      await sendActivationMail(user.email, user.name, activationUrl);
      emailSent = true;
    } catch (mailErr) {
      console.error('[USERS] Falha ao reenviar e-mail:', mailErr.message);
    }

    await audit(req.user.id, 'RESEND_INVITE', 'SystemUser', id, {}, req);

    res.json({
      success: true,
      email_sent: emailSent,
      activation_url: emailSent ? null : activationUrl,
      expires_at: expiresAt,
    });
  } catch (err) {
    console.error('Erro ao reenviar convite:', err);
    res.status(500).json({ error: 'Erro ao reenviar convite.' });
  }
});

module.exports = router;
