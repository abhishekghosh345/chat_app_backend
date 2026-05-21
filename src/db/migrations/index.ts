import { runMigrations } from './001_initial_schema';

export async function migrate() {
  try {
    await runMigrations();
  } catch (error) {
    console.error('Migration error:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  migrate();
}
