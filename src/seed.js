const { Invoice, Customer, Company, sequelize } = require("./models");
const { Op } = require("sequelize");

/**
 * Gera notas aleatórias para teste.
 * Usa a quantidade em SEED_INVOICES ou padrão 1000.
 */
async function runSeed() {
  const qtd = Number(process.env.SEED_INVOICES || 1000);

  console.log(`Iniciando seed de ${qtd} notas...`);

  const customers = await Customer.findAll({
    where: { is_active: true },
  });
  const companies = await Company.findAll({
    where: { is_active: true },
  });

  if (!customers.length || !companies.length) {
    console.log(
      "Não há clientes ou empresas ativas para gerar notas."
    );
    return;
  }

  const customersIds = customers.map((c) => c.id);
  const companiesIds = companies.map((c) => c.id);

  const invoicesToCreate = [];

  for (let i = 0; i < qtd; i++) {
    const custId =
      customersIds[Math.floor(Math.random() * customersIds.length)];
    const compId =
      companiesIds[Math.floor(Math.random() * companiesIds.length)];

    const valor = Number(
      (Math.random() * 6950 + 50).toFixed(2)
    );

    const cliente = customers.find((c) => c.id === custId);
    const taxa = Number(cliente.fee_percent || 0);
    const feeValue = Number(
      (valor * taxa / 100).toFixed(2)
    );

    const statuses = ["EMITIDA", "PAGA", "CANCELADA"];
    const status =
      statuses[Math.floor(Math.random() * statuses.length)];

    let paidAmount = null;
    if (status === "PAGA") {
      // às vezes pago parcial pra ficar mais real
      const parcial = Math.random() < 0.3;
      paidAmount = parcial
        ? Number((valor * 0.8).toFixed(2))
        : valor;
    }

    const startDate = new Date("2023-01-01T00:00:00Z");
    const endDate = new Date("2025-12-31T23:59:59Z");
    const randomTime =
      startDate.getTime() +
      Math.random() *
        (endDate.getTime() - startDate.getTime());
    const issuedAt = new Date(randomTime);

    invoicesToCreate.push({
      customer_id: custId,
      company_id: compId,
      issued_at: issuedAt,
      total_amount: valor,
      paid_amount: paidAmount,
      fee_percent: taxa,
      fee_value: feeValue,
      status,
    });
  }

  await sequelize.transaction(async (t) => {
    await Invoice.bulkCreate(invoicesToCreate, { transaction: t });
  });

  console.log(`Seed concluído: ${qtd} notas criadas.`);
}

if (require.main === module) {
  runSeed()
    .then(() => {
      console.log("Seed finalizado.");
      process.exit(0);
    })
    .catch((err) => {
      console.error("Erro no seed:", err);
      process.exit(1);
    });
}

module.exports = { runSeed };
