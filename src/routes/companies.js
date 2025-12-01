const express = require('express');
const Company = require('../models/Company');
const { authMiddleware, adminOnly } = require('../middleware/auth');

const router = express.Router();

router.use(authMiddleware);
router.use(adminOnly);

// Listar
router.get('/', async (req, res) => {
  const companies = await Company.findAll({ order: [['id', 'DESC']] });
  res.json(companies);
});

// Criar
router.post('/', async (req, res) => {
  try {
    const { cnpj, name, access_key, is_active } = req.body;
    const company = await Company.create({
      cnpj,
      name,
      access_key,
      is_active: typeof is_active === 'boolean' ? is_active : true
    });
    res.status(201).json(company);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: 'Erro ao criar empresa' });
  }
});

// Atualizar
router.put('/:id', async (req, res) => {
  try {
    const { cnpj, name, access_key, is_active } = req.body;
    const company = await Company.findByPk(req.params.id);

    if (!company) return res.status(404).json({ error: 'Empresa não encontrada' });

    company.cnpj = cnpj ?? company.cnpj;
    company.name = name ?? company.name;
    company.access_key = access_key ?? company.access_key;
    if (typeof is_active === 'boolean') company.is_active = is_active;

    await company.save();
    res.json(company);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: 'Erro ao atualizar empresa' });
  }
});

// Deletar
router.delete('/:id', async (req, res) => {
  const company = await Company.findByPk(req.params.id);
  if (!company) return res.status(404).json({ error: 'Empresa não encontrada' });

  await company.destroy();
  res.status(204).send();
});

module.exports = router;
