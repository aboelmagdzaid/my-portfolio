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
  const databaseUrl = new URL(connectionString);
  for (const parameter of [
    "ssl",
    "sslmode",
    "sslrootcert",
    "sslcert",
    "sslkey",
    "sslnegotiation",
    "uselibpqcompat",
  ]) {
    databaseUrl.searchParams.delete(parameter);
  }
  const client = new Client({
    connectionString: databaseUrl.toString(),
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
      const guidance = caCertificate
        ? "SUPABASE_DB_CA_CERT was provided but did not validate this connection. Confirm it is the full Database CA certificate for the same Supabase project as the database URL, and that it is set for Production. Do not use a client certificate or disable certificate verification."
        : "SUPABASE_DB_CA_CERT is not set for this Production deployment. Add the full Database CA certificate for this Supabase project as a Production environment variable, then redeploy. Do not disable certificate verification.";
      throw new Error(`Postgres TLS certificate could not be verified. ${guidance}`, { cause: error });
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
