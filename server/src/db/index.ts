import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

const connectionString =
  process.env.DATABASE_URL ?? "postgres://fakturujto:fakturujto@localhost:5432/fakturujto";

const client = postgres(connectionString, { max: 10 });
export const db = drizzle(client, { schema });
export type Db = typeof db;
