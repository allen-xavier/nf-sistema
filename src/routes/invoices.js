const express = require('express');
const Invoice = require('../models/Invoice');
const Customer = require('../models/Customer');
const Company = require('../models/Company');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

router.use(authMiddleware);

// Listar notas (filtros simples)
router.get('/', async (req, res) => {
  const { customer_id, company_id } = req.query;

  const where = {};
  if (customer_id) where.customer_id = customer_id;
  if (company_id) where.company_id = company_id;

  const invoices = await Invoice.findAll({
    where,
    order: [['issued_at', 'DESC']],
    include: [Customer, Company]
  });

  res.json(invoices);
});

// Criar nota (usado pela automação ou painel)
router.post('/', async (req, res) => {
  try {
    const {
      customer_id,
      company_id,
      total_amount,
      paid_amount,
      fee_percent, // se não vier, pega do cliente
      status,
      issued_at
    } = req.body;

    const customer = await Customer.findByPk(customer_id);
    const company = await Company.findByPk(company_id);

    if (!customer) return res.status(400).json({ error: 'Cliente inválido' });
    if (!company || !company.is_active) {
      return res.status(400).json({ error: 'Empresa inválida ou inativa' });
    }

    const usedFeePercent = fee_percent ?? customer.fee_percent;
    const feeValue =
      Number(total_amount) * (Number(usedFeePercent) / 100);

    const invoice = await Invoice.create({
      customer_id,
      company_id,
      total_amount,
      paid_amount: paid_amount ?? null,
      fee_percent: usedFeePercent,
      fee_value: feeValue,
      status: status || 'EMITIDA',
      issued_at: issued_at || new Date()
    });

    res.status(201).json(invoice);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: 'Erro ao criar nota' });
  }
});

module.exports = router;
