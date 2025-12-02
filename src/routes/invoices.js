const express = require("express");
const { Invoice, Customer, Company } = require("../models");
const { authMiddleware, adminOnly } = require("../middleware/auth");

const router = express.Router();

function parseBool(val) {
  if (val === true || val === false) return val;
  if (typeof val === "string") return val.toLowerCase() === "true" || val === "1";
  if (typeof val === "number") return val === 1;
  return false;
}

// Todas as rotas abaixo exigem admin
router.use(authMiddleware);
router.use(adminOnly);

/**
 * GET /api/invoices?page=1&limit=50&terminal_sale=true|false
 * Lista paginada das notas fiscais
 */
router.get("/", async (req, res) => {
  try {
    let { page, limit, terminal_sale, is_terminal_sale } = req.query;

    page = Number(page) || 1;
    limit = Number(limit) || 50;

    const offset = (page - 1) * limit;
    const where = {};

    const terminalFilter = terminal_sale ?? is_terminal_sale;
    if (terminalFilter !== undefined) {
      where.is_terminal_sale = parseBool(terminalFilter);
    }

    const { count, rows } = await Invoice.findAndCountAll({
      where,
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
 * Cria uma nota fiscal
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
      terminal_id,
      nsu,
      sale_datetime,
      sale_amount,
      is_terminal_sale,
      is_our_terminal,
      pdf_url,
      buyer_name,
      buyer_cpf,
      nf_link,
    } = req.body;

    const terminalSale =
      parseBool(is_terminal_sale) ||
      Boolean(terminal_id || nsu || sale_datetime || sale_amount);
    const ourTerminal = parseBool(is_our_terminal);

    if (
      !customer_id ||
      !company_id ||
      !total_amount ||
      (!ourTerminal && (fee_percent == null || fee_value == null))
    ) {
      return res.status(400).json({
        error:
          "Campos obrigatórios: customer_id, company_id, total_amount, fee_percent, fee_value",
      });
    }

    const computedFeePercent = ourTerminal ? 0 : fee_percent;
    const computedFeeValue = ourTerminal ? 0 : fee_value;

    const invoice = await Invoice.create({
      customer_id,
      company_id,
      issued_at: issued_at || new Date(),
      total_amount,
      paid_amount,
      fee_percent: computedFeePercent,
      fee_value: computedFeeValue,
      status: status || "EMITIDA",
      terminal_id: terminal_id || null,
      nsu: nsu || null,
      sale_datetime: sale_datetime || null,
      sale_amount: sale_amount || null,
      is_terminal_sale: terminalSale || ourTerminal,
      is_our_terminal: ourTerminal,
      pdf_url: pdf_url || null,
      nf_link: nf_link || null,
      buyer_name: buyer_name || null,
      buyer_cpf: buyer_cpf || null,
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
      terminal_id,
      nsu,
      sale_datetime,
      sale_amount,
      is_terminal_sale,
      is_our_terminal,
      pdf_url,
      buyer_name,
      buyer_cpf,
      nf_link,
    } = req.body;

    const ourTerminal = parseBool(is_our_terminal ?? invoice.is_our_terminal);
    const terminalSale =
      parseBool(is_terminal_sale ?? invoice.is_terminal_sale) ||
      Boolean(terminal_id || nsu || sale_datetime || sale_amount);

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
      ourTerminal ? 0 : (fee_percent ?? invoice.fee_percent);
    invoice.fee_value =
      ourTerminal ? 0 : (fee_value ?? invoice.fee_value);
    invoice.status = status ?? invoice.status;
    invoice.terminal_id = terminal_id ?? invoice.terminal_id;
    invoice.nsu = nsu ?? invoice.nsu;
    invoice.sale_datetime = sale_datetime ?? invoice.sale_datetime;
    invoice.sale_amount = sale_amount ?? invoice.sale_amount;
    invoice.is_terminal_sale = terminalSale;
    invoice.is_our_terminal = ourTerminal;
    invoice.pdf_url = pdf_url ?? invoice.pdf_url;
    invoice.nf_link = nf_link ?? invoice.nf_link;
    invoice.buyer_name = buyer_name ?? invoice.buyer_name;
    invoice.buyer_cpf = buyer_cpf ?? invoice.buyer_cpf;

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
