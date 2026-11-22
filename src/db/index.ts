import "server-only";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

/**
 * Neon HTTP driver: no db.transaction(). Multi-statement writes use db.batch([...]),
 * which runs as one atomic transaction (IMPLEMENTATION_PLAN.md, Section 3).
 */
export const db = drizzle({ client: neon(url), schema });
export type Db = typeof db;
export { schema };
