const fs = require("node:fs/promises");
const path = require("node:path");
const { Client } = require("pg");

async function main() {
  if (process.env.VERCEL_ENV !== "production") {
    console.log("Skipping database schema update outside a Production deployment.");
    return;
  }

  const connectionString = process.env.SUPABASE_DB_URL;
  if (!connectionString) {
    throw new Error("SUPABASE_DB_URL is required for Production deployments.");
  }

  const schemaPath = path.join(__dirname, "..", "supabase", "schema.sql");
  const schema = await fs.readFile(schemaPath, "utf8");
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: true },
    connectionTimeoutMillis: 15000,
  });

  try {
    await client.connect();
    await client.query("begin");
    await client.query(schema);
    await client.query("commit");
    console.log("Supabase schema is up to date.");
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Could not apply the Supabase schema:", error);
  process.exitCode = 1;
});
