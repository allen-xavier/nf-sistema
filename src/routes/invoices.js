const express = require("express");
const { Op } = require("sequelize");
const { Invoice, Customer, Company } = require("../models");
const { authMiddleware, adminOnly } = require("../middleware/auth");
const { audit } = require("../middleware/audit");
const { calculateInvoiceFee } = require("../utils/fees");

const router = express.Router();

function parseBool(val) {
  if (val === true || val === false) return val;
  if (typeof val === "string") return val.toLowerCase() === "true" || val === "1";
  if (typeof val === "number") return val === 1;
  return false;
}

function parseDateBoundary(value, endOfDay = false) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return null;
  const time = endOfDay ? "T23:59:59.999-03:00" : "T00:00:00-03:00";
  const parsed = new Date(`${value}${time}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isValidNumber(value, { positive = false } = {}) {
  const number = Number(value);
  return Number.isFinite(number) && (positive ? number > 0 : number >= 0);
}

// Todas as rotas abaixo exigem autenticação (qualquer usuário logado)
router.use(authMiddleware);

/**
 * GET /api/invoices?page=1&limit=50&terminal_sale=true|false
 * Lista paginada das notas fiscais
 */
router.get("/", async (req, res) => {
  try {
    let { page, limit, terminal_sale, is_terminal_sale, search, start, end } = req.query;

    page = Math.max(1, Number(page) || 1);
    limit = Math.max(1, Number(limit) || 50);

    const offset = (page - 1) * limit;
    const where = {};

    const terminalFilter = terminal_sale ?? is_terminal_sale;
    if (terminalFilter !== undefined) {
      where.is_terminal_sale = parseBool(terminalFilter);
    }

    if (start || end) {
      where.issued_at = {};
      if (start) {
        const startDate = parseDateBoundary(start);
        if (!startDate) return res.status(400).json({ error: "Data inicial inválida." });
        where.issued_at[Op.gte] = startDate;
      }
      if (end) {
        const endDate = parseDateBoundary(end, true);
        if (!endDate) return res.status(400).json({ error: "Data final inválida." });
        where.issued_at[Op.lte] = endDate;
      }
    }

    const normalizedSearch = String(search || "").trim().slice(0, 200);
    if (normalizedSearch) {
      const match = { [Op.iLike]: `%${normalizedSearch}%` };
      where[Op.or] = [
        { buyer_name: match },
        { buyer_cpf: match },
        { "$Customer.name$": match },
        { "$Company.name$": match },
      ];

      if (/^\d+$/.test(normalizedSearch)) {
        where[Op.or].push({ id: Number(normalizedSearch) });
      }
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
      distinct: true,
      subQuery: false,
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
      (!ourTerminal && fee_percent == null)
    ) {
      return res.status(400).json({
        error:
          "Campos obrigatórios: customer_id, company_id, total_amount, fee_percent",
      });
    }

    if (!isValidNumber(total_amount, { positive: true })) {
      return res.status(400).json({ error: "total_amount deve ser maior que zero." });
    }
    if (paid_amount != null && !isValidNumber(paid_amount)) {
      return res.status(400).json({ error: "paid_amount deve ser um valor válido." });
    }
    if (!ourTerminal && !isValidNumber(fee_percent)) {
      return res.status(400).json({ error: "fee_percent deve ser um valor válido." });
    }
    if (fee_value != null && !isValidNumber(fee_value)) {
      return res.status(400).json({ error: "fee_value deve ser um valor válido." });
    }

    const computedFeePercent = ourTerminal ? 0 : fee_percent;
    // Mantém o valor enviado pelas integrações. Se ele não vier, aplica a
    // regra padrão: mínimo de R$ 11 e acréscimo de R$ 1 abaixo de R$ 50.
    const computedFeeValue = ourTerminal
      ? 0
      : (fee_value ?? calculateInvoiceFee(total_amount, fee_percent));

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

    await audit(req.user.id, "CREATE_INVOICE", "Invoice", invoice.id, {
      customer_id: invoice.customer_id,
      company_id: invoice.company_id,
      total_amount: invoice.total_amount,
      paid_amount: invoice.paid_amount,
    }, req);

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

    if (total_amount != null && !isValidNumber(total_amount, { positive: true })) {
      return res.status(400).json({ error: "total_amount deve ser maior que zero." });
    }
    if (paid_amount != null && !isValidNumber(paid_amount)) {
      return res.status(400).json({ error: "paid_amount deve ser um valor válido." });
    }
    if (fee_percent != null && !isValidNumber(fee_percent)) {
      return res.status(400).json({ error: "fee_percent deve ser um valor válido." });
    }
    if (fee_value != null && !isValidNumber(fee_value)) {
      return res.status(400).json({ error: "fee_value deve ser um valor válido." });
    }

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

    await audit(req.user.id, "UPDATE_INVOICE", "Invoice", invoice.id, {
      customer_id: invoice.customer_id,
      company_id: invoice.company_id,
      total_amount: invoice.total_amount,
      paid_amount: invoice.paid_amount,
      status: invoice.status,
    }, req);

    res.json(invoice);
  } catch (err) {
    console.error("Erro ao atualizar nota:", err);
    res
      .status(500)
      .json({ error: "Erro ao atualizar nota fiscal." });
  }
});

/**
 * DELETE /api/invoices/:id (admin only)
 */
router.delete("/:id", adminOnly, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const invoice = await Invoice.findByPk(id);

    if (!invoice) {
      return res
        .status(404)
        .json({ error: "Nota não encontrada." });
    }

    await invoice.destroy();
    await audit(req.user.id, "DELETE_INVOICE", "Invoice", id, {
      customer_id: invoice.customer_id,
      company_id: invoice.company_id,
      total_amount: invoice.total_amount,
    }, req);
    res.json({ success: true });
  } catch (err) {
    console.error("Erro ao excluir nota:", err);
    res
      .status(500)
      .json({ error: "Erro ao excluir nota fiscal." });
  }
});

module.exports = router;
