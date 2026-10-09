import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { config } from '../config'
import * as schema from './schema'

export const sql = postgres(config.databaseUrl, { max: 10 })
export const db = drizzle(sql, { schema })
