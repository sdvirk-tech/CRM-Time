import { createDatabase } from "./db.js";
import { createApp } from "./app.js";
import { seedIfEmpty } from "./seed.js";

const PORT = Number(process.env.PORT ?? 3001);
const DB_PATH = process.env.CRM_DB_PATH ?? "data/crm.db";

const db = createDatabase(DB_PATH);
const seeded = seedIfEmpty(db);
if (seeded > 0) {
  console.log(`Seeded ${seeded} sample contacts into ${DB_PATH}`);
}

const app = createApp(db);
app.listen(PORT, () => {
  console.log(`CRM-Time API listening on http://localhost:${PORT}`);
});
