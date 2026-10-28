const fs = require("node:fs/promises");
const path = require("node:path");
const { Client } = require("pg");

async function main() {
  if (process.env.VERCEL_ENV !== "production") {
    console.log("Skipping database schema update outside a Production deployment.");
    return;
  }

  const connectionString = process.env.SUPABASE_DB_URL || process.env.POSTGRES_URL_NON_POOLING;
  if (!connectionString) {
    throw new Error("Set SUPABASE_DB_URL or POSTGRES_URL_NON_POOLING for Production deployments.");
  }
  const connectionVariable = process.env.SUPABASE_DB_URL
    ? "SUPABASE_DB_URL"
    : "POSTGRES_URL_NON_POOLING";

  const schemaPath = path.join(__dirname, "..", "supabase", "schema.sql");
  const schema = await fs.readFile(schemaPath, "utf8");
  const caCertificate = process.env.SUPABASE_DB_CA_CERT;
  const client = new Client({
    connectionString,
    ssl: {
      rejectUnauthorized: true,
      ...(caCertificate ? { ca: caCertificate.replace(/\\n/g, "\n") } : {}),
    },
    connectionTimeoutMillis: 15000,
  });

  try {
    await client.connect();
    await client.query("begin");
    await client.query(schema);
    await client.query("commit");
    console.log(`Supabase schema is up to date (connection from ${connectionVariable}).`);
  } catch (error) {
    await client.query("rollback").catch(() => {});
    if (error.code === "SELF_SIGNED_CERT_IN_CHAIN" || error.code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE") {
      throw new Error(
        "Postgres TLS certificate could not be verified. Add the Supabase project's CA certificate as SUPABASE_DB_CA_CERT in Vercel. Do not disable certificate verification.",
        { cause: error },
      );
    }
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Could not apply the Supabase schema:", error);
  process.exitCode = 1;
});
