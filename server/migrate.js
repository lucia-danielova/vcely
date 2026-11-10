require('dotenv').config();

const fs = require('node:fs/promises');
const path = require('node:path');
const { pool } = require('./db');

async function migrate() {
  if (!pool) throw new Error('DATABASE_URL is required');
  const sql = await fs.readFile(path.join(__dirname, '..', 'database', 'schema.sql'), 'utf8');
  await pool.query(sql);
  console.log('AGROGIS database schema is up to date.');
  await pool.end();
}

migrate().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
