import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { db, sql } from './client'

await migrate(db, { migrationsFolder: new URL('./migrations', import.meta.url).pathname })
await sql.end()
console.log('Database is up to date')
