const express = require('express');
const Customer = require('../models/Customer');
const { authMiddleware, adminOnly } = require('../middleware/auth');

const router = express.Router();

router.use(authMiddleware);
router.use(adminOnly);

// Listar
router.get('/', async (req, res) => {
  const customers = await Customer.findAll({ order: [['id', 'DESC']] });
  res.json(customers);
});

// Criar
router.post('/', async (req, res) => {
  try {
    const { name, whatsapp_number, fee_percent } = req.body;
    const customer = await Customer.create({ name, whatsapp_number, fee_percent });
    res.status(201).json(customer);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: 'Erro ao criar cliente' });
  }
});

// Atualizar
router.put('/:id', async (req, res) => {
  try {
    const { name, whatsapp_number, fee_percent, is_active } = req.body;
    const customer = await Customer.findByPk(req.params.id);

    if (!customer) return res.status(404).json({ error: 'Cliente não encontrado' });

    customer.name = name ?? customer.name;
    customer.whatsapp_number = whatsapp_number ?? customer.whatsapp_number;
    customer.fee_percent = fee_percent ?? customer.fee_percent;
    if (typeof is_active === 'boolean') customer.is_active = is_active;

    await customer.save();
    res.json(customer);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: 'Erro ao atualizar cliente' });
  }
});

// Deletar (opcional, mas em geral é melhor só inativar)
router.delete('/:id', async (req, res) => {
  const customer = await Customer.findByPk(req.params.id);
  if (!customer) return res.status(404).json({ error: 'Cliente não encontrado' });

  await customer.destroy();
  res.status(204).send();
});

module.exports = router;
