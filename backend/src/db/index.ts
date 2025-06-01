import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const DATABASE_URL = 'postgresql://postgres.bcfgzoapdrpycgpmrkou:gp4zOlSgzpERFZ5s@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres'

const globalForDb = globalThis as unknown as {
  conn: postgres.Sql | undefined;
};

const createConnection = () => {
  try {
    if (globalForDb.conn) {
      console.log('Using existing database connection');
      return globalForDb.conn;
    }
    
    if (!DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable not set');
    }
    
    console.log('Creating new database connection in db/index.ts');
    const conn = postgres(DATABASE_URL, {
      connect_timeout: 10,
      max_lifetime: 60 * 5,
      idle_timeout: 30,
      prepare: false,
      onnotice: () => {},
      onparameter: () => {}
    });
    
    if (process.env.NODE_ENV !== "production") {
      globalForDb.conn = conn;
    }
    
    return conn;
  } catch (error) {
    console.error('Failed to create database connection:', error);
    throw error; // Re-throw to make the error visible
  }
};

// Create the connection
let conn: postgres.Sql;
try {
  conn = createConnection();
  console.log('Database connection initialized');
} catch (error) {
  console.error('Fatal database connection error:', error);
  conn = {} as postgres.Sql;
}

export const db = drizzle(conn, { schema });