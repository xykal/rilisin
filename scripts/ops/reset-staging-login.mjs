// Ops SEKALI PAKAI: reset password (+ opsional jadikan admin) akun staging.
// Jalan HANYA di GitHub Actions via workflow_dispatch (baca DATABASE_URL dari Vercel API saat jalan,
// tidak ada secret yang ditulis ke repo). Hapus file ini + workflow-nya setelah dipakai.
// Env: INPUT_EMAIL, INPUT_PASSWORD, INPUT_MAKE_ADMIN, VERCEL_TOKEN, VERCEL_ORG_ID, VERCEL_PROJECT_ID.
import { randomBytes, scrypt } from "node:crypto";
import postgres from "postgres";

const email = (process.env.INPUT_EMAIL ?? "").trim().toLowerCase();
const password = process.env.INPUT_PASSWORD ?? "";
const makeAdmin = (process.env.INPUT_MAKE_ADMIN ?? "true") === "true";
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("INPUT_EMAIL tidak valid");
if (password.length < 8) throw new Error("INPUT_PASSWORD minimal 8 karakter");

const salt = randomBytes(16);
const hash = await new Promise((res, rej) =>
  scrypt(password.normalize("NFKC"), salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (e, k) =>
    e ? rej(e) : res(k),
  ),
);
const stored = ["scrypt", 16384, 8, 1, salt.toString("base64url"), hash.toString("base64url")].join("$");

const { VERCEL_TOKEN, VERCEL_ORG_ID, VERCEL_PROJECT_ID } = process.env;
const envs = await (
  await fetch(`https://api.vercel.com/v9/projects/${VERCEL_PROJECT_ID}/env?teamId=${VERCEL_ORG_ID}&limit=100`, {
    headers: { Authorization: `Bearer ${VERCEL_TOKEN}` },
  })
).json();
const dbEnv = (envs.envs ?? []).find((e) => e.key === "DATABASE_URL" && (e.target ?? []).includes("production"));
if (!dbEnv) throw new Error("DATABASE_URL production tidak ketemu di Vercel");
const dbVal = await (
  await fetch(`https://api.vercel.com/v9/projects/${VERCEL_PROJECT_ID}/env/${dbEnv.id}?teamId=${VERCEL_ORG_ID}`, {
    headers: { Authorization: `Bearer ${VERCEL_TOKEN}` },
  })
).json();
const sql = postgres(dbVal.value, { max: 1, prepare: false });
const rows = await sql`
  update users set password_hash = ${stored}, password_changed_at = now(),
    role = case when ${makeAdmin} then 'admin'::user_role else role end,
    email_verified_at = coalesce(email_verified_at, now())
  where lower(email) = ${email} returning id, username, role`;
await sql.end();
if (rows.length !== 1) throw new Error(`Akun ${email} tidak ketemu di staging (${rows.length})`);
console.log(`OK: ${rows[0].username} (${rows[0].role}) password direset${makeAdmin ? " + admin" : ""}.`);
