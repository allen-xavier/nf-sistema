require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const app = express();
const PORT = process.env.PORT || 3000;

const { sequelize, Customer, Company, Invoice, SystemUser } = require("./models");

// Rotas padrão existentes
const customersRoutes = require("./routes/customers");
const companiesRoutes = require("./routes/companies");
const invoicesRoutes = require("./routes/invoices");
const authRoutes = require("./routes/auth");

// Rotas NOVAS
const reportsRoutes = require("./routes/reports");
const authExtraRoutes = require("./routes/authExtra");

app.use(cors());
app.use(express.json());

// Rotas API
app.use("/api/customers", customersRoutes);
app.use("/api/companies", companiesRoutes);
app.use("/api/invoices", invoicesRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/auth", authExtraRoutes); // forgot-password
app.use("/api/reports", reportsRoutes);

// Arquivos estáticos (frontend)
app.use(express.static("public"));

/**
 * Inicialização principal
 */
async function start() {
  try {
    // Teste de conexão
    await sequelize.authenticate();
    console.log("Conectado ao banco de dados");

    // Sincroniza modelos
    await sequelize.sync({ alter: true });
    console.log("Models sincronizados com o banco (alter: true)");

    // ---------------------------------------------
    // 1) Criar administrador se não existir
    // ---------------------------------------------
    const adminEmail = process.env.APP_ADMIN_EMAIL;
    const adminPassword = process.env.APP_ADMIN_PASSWORD;
    const adminName = process.env.APP_ADMIN_NAME || "Admin";

    if (adminEmail && adminPassword) {
      const existing = await SystemUser.findOne({
        where: { email: adminEmail },
      });

      if (!existing) {
        const hash = await bcrypt.hash(adminPassword, 10);
        await SystemUser.create({
          name: adminName,
          email: adminEmail,
          password_hash: hash,
          is_admin: true,
        });
        console.log("Usuário admin criado:", adminEmail);
      } else {
        console.log("Usuário admin já existe");
      }
    } else {
      console.warn("APP_ADMIN_EMAIL/APP_ADMIN_PASSWORD não configurados");
    }

    // ---------------------------------------------
    // 2) SEED automático (opcional)
    // ---------------------------------------------
    //if (process.env.SEED_ON_START === "1") {
    //  const { runSeed } = require("./seed");

    //  const quantidade =
    //    Number(process.env.SEED_INVOICES || 1000);

    //  console.log(
    //    `Executando SEED automático com ${quantidade} notas...`
    //  );

    //  await runSeed();

    //  console.log("Seed finalizado.");
    //}

    // ---------------------------------------------
    // 3) Iniciar servidor
    // ---------------------------------------------
    app.listen(PORT, () => {
      console.log(`Servidor rodando na porta ${PORT}`);
    });

  } catch (err) {
    console.error("Erro ao iniciar a aplicação:", err);
    process.exit(1);
  }
}

start();
