/**
 * Import products from an Excel file into the products table.
 *
 * Usage:
 *   node scripts/import-products.js [path-to-excel]
 *
 * Default Excel path: ../../Product Master.xlsx  (repo root)
 *
 * Expected columns (row 1 = header, skipped):
 *   A: Product Name
 *   B: Product Code   ← required; rows without this are skipped
 *   C: Unit (UOM)
 *   D: Sale Rate
 *
 * On duplicate product_code: updates product_name, unit, sale_rate.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const XLSX = require('xlsx');
const mysql = require('mysql2/promise');

const EXCEL_PATH = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(__dirname, '../../Product Master.xlsx');

async function main() {
  console.log(`Reading: ${EXCEL_PATH}`);

  const wb = XLSX.readFile(EXCEL_PATH);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  // rows[0] is the header row — skip it
  const data = rows.slice(1);

  const products = [];
  let skipped = 0;

  for (const row of data) {
    const productName = String(row[0] || '').trim();
    const productCode = String(row[1] || '').trim();
    const unit       = String(row[2] || '').trim() || 'SQFT';
    const rateRaw    = row[3];

    if (!productCode) { skipped++; continue; }
    if (!productName) { skipped++; continue; }

    const saleRate = rateRaw !== '' && rateRaw !== null && rateRaw !== undefined
      ? parseFloat(rateRaw)
      : null;

    products.push({ product_name: productName, product_code: productCode, unit, sale_rate: saleRate });
  }

  console.log(`Valid rows: ${products.length}  |  Skipped (no code/name): ${skipped}`);

  if (products.length === 0) {
    console.log('Nothing to import.');
    return;
  }

  const pool = await mysql.createPool({
    host:     process.env.DB_HOST     || 'localhost',
    port:     process.env.DB_PORT     || 3306,
    user:     process.env.DB_USER     || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME     || 'optiroll',
    waitForConnections: true,
    connectionLimit: 5,
  });

  const CHUNK = 200;
  let processed = 0;
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    for (let i = 0; i < products.length; i += CHUNK) {
      const chunk = products.slice(i, i + CHUNK);
      const placeholders = chunk.map(() => '(?, ?, ?, ?)').join(', ');
      const values = chunk.flatMap(r => [r.product_name, r.product_code, r.unit, r.sale_rate]);

      await conn.execute(
        `INSERT INTO products (product_name, product_code, unit, sale_rate)
         VALUES ${placeholders}
         ON DUPLICATE KEY UPDATE
           product_name = VALUES(product_name),
           unit         = VALUES(unit),
           sale_rate    = VALUES(sale_rate)`,
        values
      );
      processed += chunk.length;
      process.stdout.write(`\rInserted/updated: ${processed}/${products.length}`);
    }

    await conn.commit();
    console.log('\nDone.');
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
    await pool.end();
  }
}

main().catch(err => { console.error('\nError:', err.message); process.exit(1); });
