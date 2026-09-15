const express = require("express");
const { Customer, SystemUser } = require("../models");
const { authMiddleware } = require("../middleware/auth");
const { audit } = require("../middleware/audit");

const router = express.Router();

const MIN_FEE_PERCENT = 2;

// Apenas autenticação (não precisa ser admin)
router.use(authMiddleware);

/**
 * GET /api/customers
 * Lista todos os clientes.
 */
router.get("/", async (req, res) => {
  try {
    const customers = await Customer.findAll({
      include: [{ model: SystemUser, as: "CreatedBy", attributes: ["id", "name"] }],
      order: [["name", "ASC"]],
    });
    res.json(customers);
  } catch (err) {
    console.error("Erro ao listar clientes:", err);
    res.status(500).json({ error: "Erro ao listar clientes." });
  }
});

/**
 * GET /api/customers/:id
 */
router.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const customer = await Customer.findByPk(id, {
      include: [{ model: SystemUser, as: "CreatedBy", attributes: ["id", "name"] }],
    });

    if (!customer) {
      return res.status(404).json({ error: "Cliente não encontrado." });
    }

    res.json(customer);
  } catch (err) {
    console.error("Erro ao buscar cliente:", err);
    res.status(500).json({ error: "Erro ao buscar cliente." });
  }
});

/**
 * POST /api/customers
 * Cria um novo cliente.
 */
router.post("/", async (req, res) => {
  try {
    let { name, whatsapp_number, fee_percent, is_active, uses_nf, uses_pos } = req.body;

    if (!name || !whatsapp_number || fee_percent == null) {
      return res.status(400).json({
        error: "Nome, WhatsApp e taxa (%) são obrigatórios.",
      });
    }

    fee_percent = Number(fee_percent);
    if (!Number.isFinite(fee_percent) || fee_percent < 0 || fee_percent > 999.99) {
      return res.status(400).json({ error: "Informe uma taxa válida." });
    }

    // Não-admin: taxa mínima 2%
    if (!req.user.is_admin && parseFloat(fee_percent) < MIN_FEE_PERCENT) {
      return res.status(400).json({
        error: `Taxa mínima é ${MIN_FEE_PERCENT}%.`,
      });
    }

    if (is_active == null) is_active = true;

    const customer = await Customer.create({
      name,
      whatsapp_number,
      fee_percent,
      is_active,
      uses_nf: uses_nf ?? true,
      uses_pos: uses_pos ?? true,
      created_by_user_id: req.user.id,
    });

    await audit(req.user.id, "CREATE_CUSTOMER", "Customer", customer.id, {
      name: customer.name,
      whatsapp_number: customer.whatsapp_number,
      fee_percent: customer.fee_percent,
    }, req);

    res.status(201).json(customer);
  } catch (err) {
    console.error("Erro ao criar cliente:", err);

    if (err.name === "SequelizeUniqueConstraintError") {
      return res.status(400).json({
        error: "Já existe um cliente com esse número de WhatsApp.",
      });
    }

    res.status(500).json({ error: "Erro ao criar cliente." });
  }
});

/**
 * PUT /api/customers/:id
 * Atualiza um cliente.
 */
router.put("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const customer = await Customer.findByPk(id);

    if (!customer) {
      return res.status(404).json({ error: "Cliente não encontrado." });
    }

    // Não-admin: só edita seus próprios clientes
    if (!req.user.is_admin && customer.created_by_user_id !== req.user.id) {
      return res.status(403).json({
        error: "Você só pode editar clientes que você cadastrou.",
      });
    }

    let { name, whatsapp_number, fee_percent, is_active, uses_nf, uses_pos } = req.body;

    if (!name || !whatsapp_number || fee_percent == null) {
      return res.status(400).json({
        error: "Nome, WhatsApp e taxa (%) são obrigatórios.",
      });
    }

    fee_percent = Number(fee_percent);
    if (!Number.isFinite(fee_percent) || fee_percent < 0 || fee_percent > 999.99) {
      return res.status(400).json({ error: "Informe uma taxa válida." });
    }

    // Não-admin: taxa mínima 2%
    if (!req.user.is_admin && parseFloat(fee_percent) < MIN_FEE_PERCENT) {
      return res.status(400).json({
        error: `Taxa mínima é ${MIN_FEE_PERCENT}%.`,
      });
    }

    if (is_active == null) is_active = true;

    customer.name = name;
    customer.whatsapp_number = whatsapp_number;
    customer.fee_percent = fee_percent;
    customer.is_active = is_active;
    if (uses_nf != null) customer.uses_nf = uses_nf;
    if (uses_pos != null) customer.uses_pos = uses_pos;

    await customer.save();

    await audit(req.user.id, "UPDATE_CUSTOMER", "Customer", customer.id, {
      name: customer.name,
      whatsapp_number: customer.whatsapp_number,
      fee_percent: customer.fee_percent,
      is_active: customer.is_active,
    }, req);

    res.json(customer);
  } catch (err) {
    console.error("Erro ao atualizar cliente:", err);

    if (err.name === "SequelizeUniqueConstraintError") {
      return res.status(400).json({
        error: "Já existe um cliente com esse número de WhatsApp.",
      });
    }

    res.status(500).json({ error: "Erro ao atualizar cliente." });
  }
});

/**
 * DELETE /api/customers/:id
 */
router.delete("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const customer = await Customer.findByPk(id);

    if (!customer) {
      return res.status(404).json({ error: "Cliente não encontrado." });
    }

    // Não-admin: só deleta seus próprios
    if (!req.user.is_admin && customer.created_by_user_id !== req.user.id) {
      return res.status(403).json({
        error: "Você só pode excluir clientes que você cadastrou.",
      });
    }

    await customer.destroy();
    await audit(req.user.id, "DELETE_CUSTOMER", "Customer", id, {
      name: customer.name,
      whatsapp_number: customer.whatsapp_number,
    }, req);
    res.json({ success: true });
  } catch (err) {
    console.error("Erro ao excluir cliente:", err);
    res.status(500).json({ error: "Erro ao excluir cliente." });
  }
});

module.exports = router;
