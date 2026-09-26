import "dotenv/config";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { authRouter } from "./routes/auth.js";
import { invoicesRouter } from "./routes/invoices.js";
import { publicRouter } from "./routes/public.js";
import { supplierRouter } from "./routes/supplier.js";
import { usersRouter } from "./routes/users.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function runMigrations() {
  const connectionString =
    process.env.DATABASE_URL ?? "postgres://fakturujto:fakturujto@localhost:5432/fakturujto";
  const client = postgres(connectionString, { max: 1 });
  const db = drizzle(client);
  const migrationsFolder = path.resolve(__dirname, "../drizzle");
  await migrate(db, { migrationsFolder });
  await client.end();
}

async function main() {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("JWT_SECRET must be set (min 16 characters)");
    }
    process.env.JWT_SECRET = process.env.JWT_SECRET || "dev-only-jwt-secret-change-me";
    console.warn("Using development JWT_SECRET — set JWT_SECRET in production.");
  }

  await runMigrations();

  const app = express();
  const port = Number(process.env.PORT || 3001);
  const corsRaw = process.env.CORS_ORIGIN?.trim();
  const corsOrigin =
    !corsRaw || corsRaw === "*" || corsRaw === "true"
      ? true
      : corsRaw.includes(",")
        ? corsRaw.split(",").map((s) => s.trim()).filter(Boolean)
        : corsRaw;

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(
    cors({
      origin: corsOrigin,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "2mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/users", usersRouter);
  app.use("/api/invoices", invoicesRouter);
  app.use("/api/supplier", supplierRouter);
  app.use("/api/public", publicRouter);

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error: "Interní chyba serveru." });
  });

  app.listen(port, "0.0.0.0", () => {
    console.log(`Fakturujto API listening on :${port}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
