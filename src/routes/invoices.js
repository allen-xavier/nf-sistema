const express = require("express");
const { Invoice, Customer, Company } = require("../models");
const { authMiddleware, adminOnly } = require("../middleware/auth");

const router = express.Router();

// Todas as rotas abaixo exigem admin
router.use(authMiddleware);
router.use(adminOnly);

/**
 * GET /api/invoices
 * Lista TODAS as notas fiscais.
 * O frontend aplica os filtros.
 */
/**
 * GET /api/invoices?page=1&limit=50
 * Lista paginada das notas fiscais
 */
router.get("/", async (req, res) => {
  try {
    let { page, limit } = req.query;

    page = Number(page) || 1;
    limit = Number(limit) || 50;

    const offset = (page - 1) * limit;

    const { count, rows } = await Invoice.findAndCountAll({
      include: [
        { model: Customer, as: "Customer" },
        { model: Company, as: "Company" },
      ],
      order: [["issued_at", "DESC"]],
      limit,
      offset,
    });

    res.json({
      data: rows,
      pagination: {
        total: count,
        page,
        limit,
        pages: Math.ceil(count / limit),
      },
    });
  } catch (err) {
    console.error("Erro ao listar notas paginadas:", err);
    res.status(500).json({
      error: "Erro ao listar notas fiscais.",
    });
  }
});


/**
 * GET /api/invoices/:id
 * Retorna uma nota específica
 */
router.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const invoice = await Invoice.findByPk(id, {
      include: [
        { model: Customer, as: "Customer" },
        { model: Company, as: "Company" },
      ],
    });

    if (!invoice) {
      return res
        .status(404)
        .json({ error: "Nota não encontrada." });
    }

    res.json(invoice);
  } catch (err) {
    console.error("Erro ao buscar nota:", err);
    res
      .status(500)
      .json({ error: "Erro ao buscar nota fiscal." });
  }
});

/**
 * POST /api/invoices
 * Cria uma nota fiscal manualmente (opcional para você)
 */
router.post("/", async (req, res) => {
  try {
    const {
      customer_id,
      company_id,
      issued_at,
      total_amount,
      paid_amount,
      fee_percent,
      fee_value,
      status,
    } = req.body;

    if (
      !customer_id ||
      !company_id ||
      !total_amount ||
      fee_percent == null ||
      fee_value == null
    ) {
      return res.status(400).json({
        error:
          "Campos obrigatórios: customer_id, company_id, total_amount, fee_percent, fee_value",
      });
    }

    const invoice = await Invoice.create({
      customer_id,
      company_id,
      issued_at: issued_at || new Date(),
      total_amount,
      paid_amount,
      fee_percent,
      fee_value,
      status: status || "EMITIDA",
    });

    res.status(201).json(invoice);
  } catch (err) {
    console.error("Erro ao criar nota:", err);
    res
      .status(500)
      .json({ error: "Erro ao criar nota fiscal." });
  }
});

/**
 * PUT /api/invoices/:id
 * Atualiza uma nota fiscal existente.
 */
router.put("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const invoice = await Invoice.findByPk(id);

    if (!invoice) {
      return res
        .status(404)
        .json({ error: "Nota não encontrada." });
    }

    const {
      customer_id,
      company_id,
      issued_at,
      total_amount,
      paid_amount,
      fee_percent,
      fee_value,
      status,
    } = req.body;

    invoice.customer_id =
      customer_id ?? invoice.customer_id;
    invoice.company_id =
      company_id ?? invoice.company_id;
    invoice.issued_at = issued_at ?? invoice.issued_at;
    invoice.total_amount =
      total_amount ?? invoice.total_amount;
    invoice.paid_amount =
      paid_amount ?? invoice.paid_amount;
    invoice.fee_percent =
      fee_percent ?? invoice.fee_percent;
    invoice.fee_value =
      fee_value ?? invoice.fee_value;
    invoice.status = status ?? invoice.status;

    await invoice.save();

    res.json(invoice);
  } catch (err) {
    console.error("Erro ao atualizar nota:", err);
    res
      .status(500)
      .json({ error: "Erro ao atualizar nota fiscal." });
  }
});

/**
 * DELETE /api/invoices/:id
 */
router.delete("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const invoice = await Invoice.findByPk(id);

    if (!invoice) {
      return res
        .status(404)
        .json({ error: "Nota não encontrada." });
    }

    await invoice.destroy();
    res.json({ success: true });
  } catch (err) {
    console.error("Erro ao excluir nota:", err);
    res
      .status(500)
      .json({ error: "Erro ao excluir nota fiscal." });
  }
});

module.exports = router;
