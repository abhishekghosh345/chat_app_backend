import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

function envHasUrl(value?: string) {
  return !!value && /^postgres(ql)?:\/\//i.test(value);
}

const databaseUrl = process.env.DATABASE_URL || process.env.DB_URL;
const hostOrUrl = process.env.DB_HOST;

function shouldUseSslForHost(host?: string) {
  if (!host) return false;
  // Render Postgres commonly requires SSL even when you're provided host/user/password separately.
  // Heuristic: any non-localhost host should use SSL; Render domains typically end with render.com.
  const isLocal = /^localhost$|^127\.0\.0\.1$/.test(host);
  const looksLikeRender = /\.render\.com$/i.test(host) || /render\.com$/i.test(host);
  return !isLocal || looksLikeRender;
}


// Prefer a single connection string when available (Render commonly requires SSL).
// Otherwise fall back to individual env vars.
const pool = new Pool({
  ...(databaseUrl
    ? {
        connectionString: databaseUrl,
        ssl: { rejectUnauthorized: false },
      }
    : envHasUrl(hostOrUrl)
      ? {
          connectionString: hostOrUrl,
          ssl: { rejectUnauthorized: false },
        }
      : {
          host: process.env.DB_HOST || 'localhost',
          port: parseInt(process.env.DB_PORT || '5432'),
          user: process.env.DB_USER || 'postgres',
          password: process.env.DB_PASSWORD || 'postgres',
          database: process.env.DB_NAME || 'chat_app',
          ssl: shouldUseSslForHost(hostOrUrl) ? { rejectUnauthorized: false } : undefined,
        }),
});


// Helpful debug to catch misconfigured DB_HOST/DB_PORT early
console.log('DB target:', {
  databaseUrl: databaseUrl ? '[set]' : undefined,
  dbHost: hostOrUrl || 'localhost',
  dbPort: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : 5432,
  dbUser: process.env.DB_USER || 'postgres',
  dbName: process.env.DB_NAME || 'chat_app',
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

