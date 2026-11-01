import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { db } from './index';

async function runMigrations() {
  console.log('==> Running database migrations...');
  await migrate(db, { migrationsFolder: './drizzle' });
  console.log('==> Database migrations completed successfully!');
  process.exit(0);
}

runMigrations().catch((err) => {
  console.error('==> Migration failed:', err);
  process.exit(1);
});
