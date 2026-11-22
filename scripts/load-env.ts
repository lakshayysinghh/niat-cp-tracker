// Imported FIRST by scripts that use src/db (which reads DATABASE_URL at import time).
// Locally this loads .env.local; in GitHub Actions the variables come from secrets.
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
