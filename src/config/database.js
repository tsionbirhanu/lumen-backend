const { Pool } = require('pg');
require('dotenv').config();

const isProduction = process.env.NODE_ENV === "production";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isProduction ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});


pool.on('connect', () => console.log('✅ New client connected to PostgreSQL'));
pool.on('error', (err) => console.error('❌ Unexpected error on idle client:', err.message));

const testConnection = async () => {
  let client;
  try {
    console.log('Testing database connection...');
    client = await pool.connect();


    const result = await client.query('SELECT NOW() AS current_time');
    console.log('✅ Database connection successful! Current time:', result.rows[0].current_time);


    const tablesCheck = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    console.log('📊 Existing tables:', tablesCheck.rows.map(row => row.table_name));

    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);

    if (error.code === '28P01') console.log('🔐 Authentication failed. Check your DATABASE_URL');
    else if (error.code === '3D000') console.log('🗄️ Database does not exist.');
    else if (error.code === 'ECONNREFUSED') console.log('🔌 Connection refused. Check port or network.');

    return false;
  } finally {
    if (client) client.release();
  }
};

module.exports = { pool, testConnection };
