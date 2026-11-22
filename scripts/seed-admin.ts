/**
 * Idempotently upserts the "Batch 1" row and the first admin from
 * SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD (optional SEED_ADMIN_NAME).
 *
 *   npm run seed                      # safe to run any number of times
 *   npm run seed -- --reset-password  # also reset the admin's password from .env.local
 */
import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { admins, batches } from "../src/db/schema";

config({ path: ".env.local", quiet: true });

const BATCH_NAME = "Batch 1";
const BCRYPT_COST = 12;
const MIN_PASSWORD = 10;

async function main() {
  const url = process.env.DATABASE_URL;
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  const name = process.env.SEED_ADMIN_NAME?.trim() || "Admin";
  const resetPassword = process.argv.includes("--reset-password");

  if (!url) throw new Error("DATABASE_URL is not set (.env.local)");
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("SEED_ADMIN_EMAIL is missing or invalid");
  if (!password || password.length < MIN_PASSWORD) {
    throw new Error(`SEED_ADMIN_PASSWORD must be at least ${MIN_PASSWORD} characters`);
  }

  const db = drizzle({ client: neon(url) });

  await db.insert(batches).values({ name: BATCH_NAME }).onConflictDoNothing({ target: batches.name });
  const [batch] = await db.select({ id: batches.id }).from(batches).where(eq(batches.name, BATCH_NAME));
  console.log(`Batch:  "${BATCH_NAME}" (${batch.id})`);

  const [existing] = await db.select({ id: admins.id }).from(admins).where(eq(admins.email, email));
  if (!existing) {
    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
    const [created] = await db
      .insert(admins)
      .values({ email, name, passwordHash, role: "admin" })
      .onConflictDoNothing({ target: admins.email })
      .returning({ id: admins.id });
    console.log(created ? `Admin:  created ${email} (role admin)` : `Admin:  ${email} already exists`);
  } else if (resetPassword) {
    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
    await db
      .update(admins)
      .set({ passwordHash, failedLogins: 0, lockedUntil: null })
      .where(eq(admins.id, existing.id));
    console.log(`Admin:  ${email} exists; password reset from SEED_ADMIN_PASSWORD and lockout cleared`);
  } else {
    console.log(`Admin:  ${email} already exists; password unchanged (use --reset-password to reset it)`);
  }
}

main().catch((err) => {
  console.error("Seed failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
