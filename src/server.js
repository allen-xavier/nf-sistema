require('dotenv').config();
const bcrypt = require('bcryptjs');
const app = require('./app');
const sequelize = require('./db');
const SystemUser = require('./models/SystemUser');
require('./models/Customer');
require('./models/Company');
require('./models/Invoice');

const PORT = process.env.APP_PORT || 3000;

async function start() {
  try {
    await sequelize.authenticate();
    console.log('Conectado ao banco de dados');

    await sequelize.sync();
    console.log('Models sincronizados com o banco');

    // Cria admin se não existir
    const adminEmail = process.env.APP_ADMIN_EMAIL;
    const adminPassword = process.env.APP_ADMIN_PASSWORD;
    const adminName = process.env.APP_ADMIN_NAME || 'Admin';

    if (adminEmail && adminPassword) {
      const existing = await SystemUser.findOne({ where: { email: adminEmail } });
      if (!existing) {
        const hash = await bcrypt.hash(adminPassword, 10);
        await SystemUser.create({
          name: adminName,
          email: adminEmail,
          password_hash: hash,
          is_admin: true
        });
        console.log('Usuário admin criado:', adminEmail);
      } else {
        console.log('Usuário admin já existe');
      }
    } else {
      console.warn('APP_ADMIN_EMAIL/APP_ADMIN_PASSWORD não configurados');
    }

    app.listen(PORT, () => {
      console.log(`Servidor rodando na porta ${PORT}`);
    });
  } catch (err) {
    console.error('Erro ao iniciar a aplicação:', err);
    process.exit(1);
  }
}

start();
