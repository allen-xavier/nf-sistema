const express = require('express');
const { Op } = require('sequelize');
const Invoice = require('../models/Invoice');
const Customer = require('../models/Customer');
const { authMiddleware, adminOnly } = require('../middleware/auth');

const router = express.Router();

router.use(authMiddleware);
router.use(adminOnly);

// /reports/summary?start=2024-01-01&end=2024-01-31&customer_id=...
router.get('/summary', async (req, res) => {
  try {
    const { start, end, customer_id } = req.query;

    const where = {};
    if (start && end) {
      where.issued_at = { [Op.between]: [new Date(start), new Date(end)] };
    }

    if (customer_id) {
      where.customer_id = customer_id;
    }

    const totals = await Invoice.findAll({
      where,
      attributes: [
        [Invoice.sequelize.fn('COUNT', Invoice.sequelize.col('id')), 'total_notas'],
        [Invoice.sequelize.fn('SUM', Invoice.sequelize.col('total_amount')), 'soma_valor_total'],
        [Invoice.sequelize.fn('SUM', Invoice.sequelize.col('fee_value')), 'soma_taxas']
      ]
    });

    const porCliente = await Invoice.findAll({
      where,
      include: [{ model: Customer }],
      attributes: [
        'customer_id',
        [Invoice.sequelize.fn('COUNT', Invoice.sequelize.col('Invoice.id')), 'total_notas'],
        [Invoice.sequelize.fn('SUM', Invoice.sequelize.col('total_amount')), 'soma_valor_total'],
        [Invoice.sequelize.fn('SUM', Invoice.sequelize.col('fee_value')), 'soma_taxas']
      ],
      group: ['customer_id', 'Customer.id'],
      order: [[Invoice.sequelize.literal('soma_valor_total'), 'DESC']]
    });

    res.json({ totals: totals[0], porCliente });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao gerar relatório' });
  }
});

module.exports = router;
