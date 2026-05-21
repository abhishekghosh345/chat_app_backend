import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// Grab Render's connection string environment variable
const databaseUrl = process.env.DATABASE_URL || process.env.DB_URL;

// Fail-safe check: If it uses a connection string and isn't pointing to localhost, apply SSL bypass
const isRemoteConnection = databaseUrl && !databaseUrl.includes('localhost') && !databaseUrl.includes('127.0.0.1');

const poolConfig = databaseUrl
  ? {
      connectionString: databaseUrl,
      // Force bypass self-signed certificate restrictions for all remote cloud connections
      ssl: isRemoteConnection ? { rejectUnauthorized: false } : false,
    }
  : {
      // Fallback variables used exclusively for your local development environment
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      database: process.env.DB_NAME || 'chat_app',
      ssl: false,
    };

const pool = new Pool(poolConfig);

// Clean diagnostic log
console.log('DB target initialized:', {
  usingConnectionString: !!databaseUrl,
  isRemoteConnection: !!isRemoteConnection,
  environment: process.env.NODE_ENV || 'not set',
});

pool.on('error', (err: any) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

export default pool;

export async function query(text: string, params?: any[]) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log('Executed query', { text, duration, rows: res.rowCount });
    return res;
  } catch (error) {
    console.error('Database error', error);
    throw error;
  }
}

export async function getClient() {
  return pool.connect();
}

export async function closePool() {
  await pool.end();
}
