const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
  max: 20,
});

pool.on('connect', (client) => {
  console.log('✅ New client connected to PostgreSQL');
});

pool.on('error', (err, client) => {
  console.error('❌ Unexpected error on idle client:', err.message);
});


const testConnection = async () => {
  let client;
  try {
    console.log('Testing database connection...');
    client = await pool.connect();
    const result = await client.query('SELECT NOW() as current_time');
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
    
    if (error.code === '28P01') {
      console.log('🔐 Authentication failed. Check your password in the .env file');
    } else if (error.code === '3D000') {
      console.log('🗄️ Database does not exist. Create it with: CREATE DATABASE lumen_chatbot;');
    } else if (error.code === 'ECONNREFUSED') {
      console.log('🔌 Connection refused. Check if PostgreSQL is running on port 5432');
    }
    return false;
    
  } finally {
    if (client) {
      client.release();
    }
  }
};

module.exports = { pool, testConnection };