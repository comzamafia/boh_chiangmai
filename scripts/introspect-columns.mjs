import pg from "pg";
const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
const { rows } = await client.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'recipes' ORDER BY ordinal_position`);
rows.forEach(r => console.log(r.column_name, "|", r.data_type));
// Also show a sample row
const { rows: sample } = await client.query(`SELECT * FROM recipes LIMIT 1`);
if (sample.length) console.log("\nSAMPLE KEYS:", Object.keys(sample[0]).join(", "));
await client.end();
