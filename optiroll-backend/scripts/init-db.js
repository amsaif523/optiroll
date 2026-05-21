const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const initDB = async () => {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || ''
  });

  const dbName = process.env.DB_NAME || 'optiroll';

  await connection.query(`CREATE DATABASE IF NOT EXISTS ${dbName} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await connection.query(`USE ${dbName}`);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(50) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      full_name VARCHAR(100) NOT NULL,
      role ENUM('admin','operator') DEFAULT 'operator',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Seed default admin if not exists
  const [existing] = await connection.query('SELECT id FROM users WHERE username = ?', ['admin']);
  if (existing.length === 0) {
    const hash = await bcrypt.hash('admin123', 10);
    await connection.query(
      'INSERT INTO users (username, password_hash, full_name, role) VALUES (?, ?, ?, ?)',
      ['admin', hash, 'Administrator', 'admin']
    );
    console.log('Default admin user created — username: admin / password: admin123');
  }

  await connection.query(`
    CREATE TABLE IF NOT EXISTS rolls (
      id INT AUTO_INCREMENT PRIMARY KEY,
      width DECIMAL(5,2) NOT NULL COMMENT 'Roll width in meters',
      material_type VARCHAR(50) NOT NULL COMMENT 'Fabric type',
      color VARCHAR(50) NOT NULL,
      pattern VARCHAR(50),
      status ENUM('available','empty') DEFAULT 'available',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_material (material_type, color, pattern),
      INDEX idx_status (status)
    )
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS leftovers (
      id INT AUTO_INCREMENT PRIMARY KEY,
      original_roll_id INT,
      width DECIMAL(5,2) NOT NULL,
      length DECIMAL(6,2) NOT NULL,
      material_type VARCHAR(50) NOT NULL,
      color VARCHAR(50) NOT NULL,
      pattern VARCHAR(50),
      status ENUM('available','used') DEFAULT 'available',
      source_job_id INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_material (material_type, color, pattern),
      INDEX idx_dimensions (width, length),
      INDEX idx_status (status)
    )
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS jobs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      work_order_number VARCHAR(50),
      client_name VARCHAR(100),
      status ENUM('draft','optimized','completed') DEFAULT 'draft',
      total_pieces INT DEFAULT 0,
      total_sheets INT DEFAULT 0,
      roll_width_used DECIMAL(5,2),
      total_waste_percent DECIMAL(5,2) DEFAULT 0.00,
      total_utilization_percent DECIMAL(5,2) DEFAULT 0.00,
      allow_rotation TINYINT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS job_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      job_id INT NOT NULL,
      shade_number VARCHAR(255),
      blind_type ENUM('roller','zebra') NOT NULL,
      width DECIMAL(5,2) NOT NULL,
      height DECIMAL(5,2) NOT NULL,
      valence DECIMAL(4,2) DEFAULT 0.00,
      final_height DECIMAL(5,2) NOT NULL,
      quantity INT NOT NULL DEFAULT 1,
      material_type VARCHAR(50) NOT NULL,
      color VARCHAR(50) NOT NULL,
      pattern VARCHAR(50),
      selected_widths JSON NULL,
      grain_locked TINYINT(1) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_job (job_id)
    )
  `);

  // Idempotent migrations: add columns if they were missing on older installs.
  // MySQL throws ER_DUP_FIELDNAME (1060) if the column already exists — safe to ignore.
  const addColumnIfMissing = async (table, column, definition) => {
    try {
      await connection.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
      console.log(`Added column ${table}.${column}`);
    } catch (err) {
      if (err.code !== 'ER_DUP_FIELDNAME') throw err;
    }
  };
  await addColumnIfMissing('job_items', 'selected_widths', 'JSON NULL AFTER pattern');
  await addColumnIfMissing('job_items', 'grain_locked', 'TINYINT(1) NOT NULL DEFAULT 0 AFTER selected_widths');
  // Widen shade_number — earlier installs capped at VARCHAR(50), which
  // overflowed when users mapped Shade # to a long Product Name column.
  try {
    await connection.query(`ALTER TABLE job_items MODIFY COLUMN shade_number VARCHAR(255)`);
    console.log('Widened column job_items.shade_number to VARCHAR(255)');
  } catch (err) {
    if (err.code !== 'ER_BAD_FIELD_ERROR') throw err;
  }

  await connection.query(`
    CREATE TABLE IF NOT EXISTS optimization_results (
      id INT AUTO_INCREMENT PRIMARY KEY,
      job_id INT NOT NULL,
      sheet_number INT NOT NULL,
      sheet_type ENUM('fresh_roll','leftover') NOT NULL,
      roll_width DECIMAL(5,2) NOT NULL,
      roll_length_used DECIMAL(6,2) NOT NULL,
      blinds_placed JSON NOT NULL,
      waste_areas JSON,
      reusable_leftovers JSON,
      utilization_percent DECIMAL(5,2) NOT NULL,
      waste_percent DECIMAL(5,2) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_job (job_id)
    )
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS settings (
      \`key\` VARCHAR(100) NOT NULL PRIMARY KEY,
      \`value\` TEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS activity_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT,
      action VARCHAR(80) NOT NULL,
      entity_type VARCHAR(50),
      entity_id INT,
      description VARCHAR(255),
      metadata JSON,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_created_at (created_at),
      INDEX idx_user (user_id),
      INDEX idx_entity (entity_type, entity_id)
    )
  `);

  const defaultSettings = [
    ['roll_widths', JSON.stringify([2.0, 2.5, 2.8, 2.9, 3.0])],
    ['max_roll_length', '30'],
  ];
  for (const [key, value] of defaultSettings) {
    await connection.query(
      'INSERT IGNORE INTO settings (`key`, `value`) VALUES (?, ?)',
      [key, value]
    );
  }

  console.log('Database initialized successfully');
  await connection.end();
};

initDB().catch(console.error);
