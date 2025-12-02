const { Sequelize } = require("sequelize");

// Pega primeiro as variáveis DB_ (as que você já usa na stack)
const {
  DB_NAME,
  DB_USER,
  DB_PASSWORD,
  DB_HOST,
  DB_PORT,
  POSTGRES_DB,
  POSTGRES_USER,
  POSTGRES_PASSWORD,
  POSTGRES_HOST,
  POSTGRES_PORT,
} = process.env;

// Prioriza DB_*, e se não tiver, cai pros POSTGRES_* como fallback
const database = DB_NAME || POSTGRES_DB || "nf_sistema";
const username = DB_USER || POSTGRES_USER || "postgres";
const password =
  DB_PASSWORD || POSTGRES_PASSWORD || "postgres";
const host = DB_HOST || POSTGRES_HOST || "pgvector";
const port = Number(DB_PORT || POSTGRES_PORT || 5432);

const sequelize = new Sequelize(database, username, password, {
  host,
  port,
  dialect: "postgres",
  logging: console.log, // coloque true se quiser ver as queries no log
  timezone: "America/Sao_Paulo",
  define: {
    underscored: true,
  },
});

module.exports = sequelize;
