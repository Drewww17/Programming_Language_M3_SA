// seed-admin.js
import bcrypt from "bcryptjs";
import pg from "pg";

const { Pool } = pg;

// load environment variables
import dotenv from "dotenv";
dotenv.config();

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    "postgresql://rb_user:rb_pass@localhost:5432/resource_booking",
});

async function seed() {
  try {
    const username = "admin";
    const password = "admin123";
    const role = "ADMIN";

    const hash = await bcrypt.hash(password, 10);

    await pool.query(
      `INSERT INTO admin_users (username, password_hash, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (username)
       DO UPDATE SET password_hash = EXCLUDED.password_hash, updated_at = NOW()`,
      [username, hash, role]
    );

    console.log("✅ Seeded admin user -> username: admin  password: admin123");
  } catch (err) {
    console.error("❌ Error seeding admin:", err);
  } finally {
    await pool.end();
  }
}

seed();
