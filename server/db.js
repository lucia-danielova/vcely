const { Pool } = require('pg');

const databaseUrl = process.env.DATABASE_URL;
const pool = databaseUrl
  ? new Pool({
      connectionString: databaseUrl,
      ssl: process.env.PGSSL === 'disable' ? false : { rejectUnauthorized: false },
      max: Number(process.env.PGPOOL_MAX || 10),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000
    })
  : null;

module.exports = { pool };
