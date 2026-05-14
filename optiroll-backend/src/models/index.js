const pool = require('../config/database');

const query = async (sql, params) => {
  const [rows] = await pool.execute(sql, params);
  return rows;
};

const Roll = {
  create: async (data) => {
    const sql = `INSERT INTO rolls (width, material_type, color, pattern) VALUES (?, ?, ?, ?)`;
    const [result] = await pool.execute(sql, [data.width, data.material_type, data.color, data.pattern || null]);
    return { id: result.insertId, ...data };
  },
  findAll: async (filters = {}) => {
    let sql = 'SELECT * FROM rolls WHERE 1=1';
    const params = [];
    if (filters.material_type) { sql += ' AND material_type = ?'; params.push(filters.material_type); }
    if (filters.color) { sql += ' AND color = ?'; params.push(filters.color); }
    if (filters.pattern) { sql += ' AND pattern = ?'; params.push(filters.pattern); }
    if (filters.status) { sql += ' AND status = ?'; params.push(filters.status); }
    sql += ' ORDER BY width ASC';
    return query(sql, params);
  },
  findByWidth: async (width) => query('SELECT * FROM rolls WHERE width = ? AND status = "available"', [width]),
  findById: async (id) => query('SELECT * FROM rolls WHERE id = ?', [id]),
  delete: async (id) => pool.execute('DELETE FROM rolls WHERE id = ?', [id])
};

const Leftover = {
  create: async (data) => {
    const sql = `INSERT INTO leftovers (original_roll_id, width, length, material_type, color, pattern, source_job_id) VALUES (?, ?, ?, ?, ?, ?, ?)`;
    const [result] = await pool.execute(sql, [
      data.original_roll_id || null, data.width, data.length,
      data.material_type, data.color, data.pattern || null, data.source_job_id || null
    ]);
    return { id: result.insertId, ...data };
  },
  findAll: async (filters = {}) => {
    let sql = 'SELECT * FROM leftovers WHERE status = "available"';
    const params = [];
    if (filters.material_type) { sql += ' AND material_type = ?'; params.push(filters.material_type); }
    if (filters.color) { sql += ' AND color = ?'; params.push(filters.color); }
    if (filters.pattern) { sql += ' AND pattern = ?'; params.push(filters.pattern); }
    sql += ' ORDER BY width ASC, length ASC';
    return query(sql, params);
  },
  findByMaterialSignature: async (material_type, color, pattern) => {
    return query('SELECT * FROM leftovers WHERE status = "available" AND material_type = ? AND color = ? AND (pattern = ? OR pattern IS NULL) ORDER BY width ASC, length ASC',
      [material_type, color, pattern || null]);
  },
  markUsed: async (id) => pool.execute('UPDATE leftovers SET status = "used" WHERE id = ?', [id]),
  updateDimensions: async (id, width, length) => {
    if (width <= 0 || length <= 0) {
      await pool.execute('UPDATE leftovers SET status = "used" WHERE id = ?', [id]);
    } else {
      await pool.execute('UPDATE leftovers SET width = ?, length = ? WHERE id = ?', [width, length, id]);
    }
  },
  delete: async (id) => pool.execute('DELETE FROM leftovers WHERE id = ?', [id])
};

const Job = {
  create: async (data) => {
    const sql = `INSERT INTO jobs (work_order_number, client_name, allow_rotation) VALUES (?, ?, ?)`;
    const [result] = await pool.execute(sql, [data.work_order_number || null, data.client_name || null, data.allow_rotation ? 1 : 0]);
    return { id: result.insertId, ...data };
  },
  findById: async (id) => query('SELECT * FROM jobs WHERE id = ?', [id]),
  findAll: async () => query('SELECT * FROM jobs ORDER BY created_at DESC'),
  update: async (id, data) => {
    const fields = [];
    const values = [];
    if (data.status) { fields.push('status = ?'); values.push(data.status); }
    if (data.total_pieces !== undefined) { fields.push('total_pieces = ?'); values.push(data.total_pieces); }
    if (data.total_sheets !== undefined) { fields.push('total_sheets = ?'); values.push(data.total_sheets); }
    if (data.roll_width_used !== undefined) { fields.push('roll_width_used = ?'); values.push(data.roll_width_used); }
    if (data.total_waste_percent !== undefined) { fields.push('total_waste_percent = ?'); values.push(data.total_waste_percent); }
    if (data.total_utilization_percent !== undefined) { fields.push('total_utilization_percent = ?'); values.push(data.total_utilization_percent); }
    if (fields.length === 0) return;
    values.push(id);
    await pool.execute(`UPDATE jobs SET ${fields.join(', ')} WHERE id = ?`, values);
  },
  delete: async (id) => pool.execute('DELETE FROM jobs WHERE id = ?', [id])
};

const JobItem = {
  create: async (data) => {
    let final_height;
    if (data.blind_type === 'zebra') {
      final_height = (parseFloat(data.height) * 2) + parseFloat(data.valence || 0);
    } else {
      final_height = parseFloat(data.height) + parseFloat(data.valence || 0);
    }
    const sql = `INSERT INTO job_items (job_id, shade_number, blind_type, width, height, valence, final_height, quantity, material_type, color, pattern) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    const [result] = await pool.execute(sql, [
      data.job_id, data.shade_number || null, data.blind_type, data.width, data.height,
      data.valence || 0, final_height, data.quantity || 1,
      data.material_type, data.color, data.pattern || null
    ]);
    return { id: result.insertId, ...data, final_height };
  },
  findByJob: async (jobId) => query('SELECT * FROM job_items WHERE job_id = ? ORDER BY (width * final_height) DESC', [jobId]),
  deleteByJob: async (jobId) => pool.execute('DELETE FROM job_items WHERE job_id = ?', [jobId])
};

const OptimizationResult = {
  create: async (data) => {
    const sql = `INSERT INTO optimization_results (job_id, sheet_number, sheet_type, roll_width, roll_length_used, blinds_placed, waste_areas, reusable_leftovers, utilization_percent, waste_percent) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    const [result] = await pool.execute(sql, [
      data.job_id, data.sheet_number, data.sheet_type,
      data.roll_width, data.roll_length_used,
      JSON.stringify(data.blinds_placed || []),
      JSON.stringify(data.waste_areas || []),
      JSON.stringify(data.reusable_leftovers || []),
      data.utilization_percent, data.waste_percent
    ]);
    return { id: result.insertId, ...data };
  },
  findByJob: async (jobId) => query('SELECT * FROM optimization_results WHERE job_id = ? ORDER BY sheet_number', [jobId]),
  deleteByJob: async (jobId) => pool.execute('DELETE FROM optimization_results WHERE job_id = ?', [jobId])
};

const Setting = {
  get: async (key) => {
    const rows = await query('SELECT `value` FROM settings WHERE `key` = ?', [key]);
    return rows.length > 0 ? rows[0].value : null;
  },
  set: async (key, value) => {
    const str = typeof value === 'string' ? value : JSON.stringify(value);
    await pool.execute(
      'INSERT INTO settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = ?',
      [key, str, str]
    );
  },
  getAll: async () => query('SELECT * FROM settings ORDER BY `key`'),
};

module.exports = { Roll, Leftover, Job, JobItem, OptimizationResult, Setting, query };
