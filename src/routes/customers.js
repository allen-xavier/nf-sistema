const express = require("express");
const { Customer } = require("../models");
const { authMiddleware, adminOnly } = require("../middleware/auth");

const router = express.Router();

// Todas as rotas abaixo exigem:
// - usuário autenticado
// - usuário admin
router.use(authMiddleware);
router.use(adminOnly);

/**
 * GET /api/customers
 * Lista todos os clientes.
 * O frontend faz os filtros (nome, whatsapp, taxa, ativo) do lado do navegador.
 */
router.get("/", async (req, res) => {
  try {
    const customers = await Customer.findAll({
      order: [["name", "ASC"]],
    });
    res.json(customers);
  } catch (err) {
    console.error("Erro ao listar clientes:", err);
    res
      .status(500)
      .json({ error: "Erro ao listar clientes." });
  }
});

/**
 * GET /api/customers/:id
 * Retorna um cliente específico.
 */
router.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const customer = await Customer.findByPk(id);

    if (!customer) {
      return res
        .status(404)
        .json({ error: "Cliente não encontrado." });
    }

    res.json(customer);
  } catch (err) {
    console.error("Erro ao buscar cliente:", err);
    res
      .status(500)
      .json({ error: "Erro ao buscar cliente." });
  }
});

/**
 * POST /api/customers
 * Cria um novo cliente.
 * Body esperado:
 *  {
 *    "name": "Fulano",
 *    "whatsapp_number": "+5511999999999",
 *    "fee_percent": 3.5,
 *    "is_active": true
 *  }
 */
router.post("/", async (req, res) => {
  try {
    let {
      name,
      whatsapp_number,
      fee_percent,
      is_active,
      uses_nf,
      uses_pos,
    } = req.body;

    if (!name || !whatsapp_number || fee_percent == null) {
      return res.status(400).json({
        error:
          "Nome, WhatsApp e taxa (%) são obrigatórios.",
      });
    }

    if (is_active == null) {
      is_active = true;
    }

    const customer = await Customer.create({
      name,
      whatsapp_number,
      fee_percent,
      is_active,
      uses_nf: uses_nf ?? true,
      uses_pos: uses_pos ?? true,
    });

    res.status(201).json(customer);
  } catch (err) {
    console.error("Erro ao criar cliente:", err);

    // Tratamento de WhatsApp duplicado
    if (err.name === "SequelizeUniqueConstraintError") {
      return res.status(400).json({
        error:
          "Já existe um cliente com esse número de WhatsApp.",
      });
    }

    res
      .status(500)
      .json({ error: "Erro ao criar cliente." });
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
      return res
        .status(404)
        .json({ error: "Cliente não encontrado." });
    }

    let {
      name,
      whatsapp_number,
      fee_percent,
      is_active,
      uses_nf,
      uses_pos,
    } = req.body;

    if (!name || !whatsapp_number || fee_percent == null) {
      return res.status(400).json({
        error:
          "Nome, WhatsApp e taxa (%) são obrigatórios.",
      });
    }

    if (is_active == null) {
      is_active = true;
    }

    customer.name = name;
    customer.whatsapp_number = whatsapp_number;
    customer.fee_percent = fee_percent;
    customer.is_active = is_active;
    if (uses_nf != null) customer.uses_nf = uses_nf;
    if (uses_pos != null) customer.uses_pos = uses_pos;

    await customer.save();

    res.json(customer);
  } catch (err) {
    console.error("Erro ao atualizar cliente:", err);

    if (err.name === "SequelizeUniqueConstraintError") {
      return res.status(400).json({
        error:
          "Já existe um cliente com esse número de WhatsApp.",
      });
    }

    res
      .status(500)
      .json({ error: "Erro ao atualizar cliente." });
  }
});

/**
 * DELETE /api/customers/:id
 * Remove um cliente.
 * As notas ligadas a ele são removidas por ON DELETE CASCADE (no banco).
 */
router.delete("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const customer = await Customer.findByPk(id);

    if (!customer) {
      return res
        .status(404)
        .json({ error: "Cliente não encontrado." });
    }

    await customer.destroy();

    res.json({ success: true });
  } catch (err) {
    console.error("Erro ao excluir cliente:", err);
    res
      .status(500)
      .json({ error: "Erro ao excluir cliente." });
  }
});

module.exports = router;
