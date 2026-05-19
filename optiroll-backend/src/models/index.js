const pool = require('../config/database');

const query = async (sql, params) => {
  const [rows] = await pool.execute(sql, params);
  return rows;
};

const pageArgs = (page = 1, limit = 20) => {
  const safePage = Math.max(parseInt(page) || 1, 1);
  const safeLimit = Math.min(Math.max(parseInt(limit) || 20, 1), 100);
  return {
    page: safePage,
    limit: safeLimit,
    offset: (safePage - 1) * safeLimit
  };
};

const pagedResult = (rows, total, page, limit) => ({
  rows,
  total,
  page,
  limit,
  total_pages: Math.max(Math.ceil(total / limit), 1)
});

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
  findById: async (id) => query('SELECT * FROM leftovers WHERE id = ?', [id]),
  findPage: async (filters = {}) => {
    const { page, limit, offset } = pageArgs(filters.page, filters.limit);
    let where = 'WHERE 1=1';
    const params = [];
    if (filters.q) {
      where += ' AND (material_type LIKE ? OR color LIKE ? OR pattern LIKE ? OR CAST(source_job_id AS CHAR) LIKE ?)';
      params.push(`%${filters.q}%`, `%${filters.q}%`, `%${filters.q}%`, `%${filters.q}%`);
    }
    if (filters.date_from) {
      where += ' AND created_at >= ?';
      params.push(filters.date_from);
    }
    if (filters.date_to) {
      where += ' AND created_at < DATE_ADD(?, INTERVAL 1 DAY)';
      params.push(filters.date_to);
    }
    const countRows = await query(`SELECT COUNT(*) AS total FROM leftovers ${where}`, params);
    const rows = await query(`
      SELECT *
      FROM leftovers
      ${where}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `, params);
    return pagedResult(rows, countRows[0]?.total || 0, page, limit);
  },
  stats: async (filters = {}) => {
    let where = 'WHERE 1=1';
    const params = [];
    if (filters.date_from) {
      where += ' AND created_at >= ?';
      params.push(filters.date_from);
    }
    if (filters.date_to) {
      where += ' AND created_at < DATE_ADD(?, INTERVAL 1 DAY)';
      params.push(filters.date_to);
    }
    const rows = await query(`
      SELECT
        COUNT(*) AS total_leftovers,
        SUM(CASE WHEN status = 'available' THEN 1 ELSE 0 END) AS available_leftovers,
        SUM(CASE WHEN status = 'used' THEN 1 ELSE 0 END) AS used_leftovers,
        COALESCE(SUM(width * length), 0) AS total_area,
        COALESCE(SUM(CASE WHEN status = 'available' THEN width * length ELSE 0 END), 0) AS available_area
      FROM leftovers
      ${where}
    `, params);
    return rows[0] || {
      total_leftovers: 0,
      available_leftovers: 0,
      used_leftovers: 0,
      total_area: 0,
      available_area: 0
    };
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
  findPage: async (filters = {}) => {
    const { page, limit, offset } = pageArgs(filters.page, filters.limit);
    let where = 'WHERE 1=1';
    const params = [];
    if (filters.q) {
      where += ' AND (work_order_number LIKE ? OR client_name LIKE ?)';
      params.push(`%${filters.q}%`, `%${filters.q}%`);
    }
    if (filters.status) {
      where += ' AND status = ?';
      params.push(filters.status);
    }
    if (filters.date_from) {
      where += ' AND created_at >= ?';
      params.push(filters.date_from);
    }
    if (filters.date_to) {
      where += ' AND created_at < DATE_ADD(?, INTERVAL 1 DAY)';
      params.push(filters.date_to);
    }

    const countRows = await query(`SELECT COUNT(*) AS total FROM jobs ${where}`, params);
    const rows = await query(`
      SELECT *
      FROM jobs
      ${where}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `, params);
    return pagedResult(rows, countRows[0]?.total || 0, page, limit);
  },
  stats: async (filters = {}) => {
    let where = 'WHERE 1=1';
    const params = [];
    if (filters.date_from) {
      where += ' AND created_at >= ?';
      params.push(filters.date_from);
    }
    if (filters.date_to) {
      where += ' AND created_at < DATE_ADD(?, INTERVAL 1 DAY)';
      params.push(filters.date_to);
    }
    const rows = await query(`
      SELECT
        COUNT(*) AS total_jobs,
        COALESCE(SUM(total_pieces), 0) AS total_pieces,
        COALESCE(SUM(total_sheets), 0) AS total_sheets,
        COALESCE(AVG(total_utilization_percent), 0) AS avg_utilization,
        COALESCE(AVG(total_waste_percent), 0) AS avg_waste
      FROM jobs
      ${where}
    `, params);
    return rows[0] || {
      total_jobs: 0,
      total_pieces: 0,
      total_sheets: 0,
      avg_utilization: 0,
      avg_waste: 0
    };
  },
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

const User = {
  create: async (data) => {
    const sql = `INSERT INTO users (username, password_hash, full_name, role) VALUES (?, ?, ?, ?)`;
    const [result] = await pool.execute(sql, [
      data.username,
      data.password_hash,
      data.full_name,
      data.role || 'operator'
    ]);
    return {
      id: result.insertId,
      username: data.username,
      full_name: data.full_name,
      role: data.role || 'operator'
    };
  },
  findAll: async () => query('SELECT id, username, full_name, role, created_at FROM users ORDER BY created_at DESC'),
  findPage: async (filters = {}) => {
    const { page, limit, offset } = pageArgs(filters.page, filters.limit);
    let where = 'WHERE 1=1';
    const params = [];
    if (filters.q) {
      where += ' AND (username LIKE ? OR full_name LIKE ?)';
      params.push(`%${filters.q}%`, `%${filters.q}%`);
    }
    if (filters.role) {
      where += ' AND role = ?';
      params.push(filters.role);
    }
    const countRows = await query(`SELECT COUNT(*) AS total FROM users ${where}`, params);
    const rows = await query(`
      SELECT id, username, full_name, role, created_at
      FROM users
      ${where}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `, params);
    return pagedResult(rows, countRows[0]?.total || 0, page, limit);
  },
  findByUsername: async (username) => query('SELECT id FROM users WHERE username = ?', [username])
};

const humanAction = (action = '') => {
  const labels = {
    'auth.login': 'Signed In',
    'job.optimized': 'Work Order Optimized',
    'job.deleted': 'Work Order Deleted',
    'settings.updated': 'Settings Updated',
    'user.created': 'User Created'
  };
  if (labels[action]) return labels[action];
  return action
    .split(/[._-]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

const humanEntity = (entity = '') => {
  const labels = {
    user: 'User',
    job: 'Work Order',
    settings: 'Settings'
  };
  return labels[entity] || (entity ? entity.charAt(0).toUpperCase() + entity.slice(1) : null);
};

const ActivityLog = {
  create: async ({ user_id, action, entity_type, entity_id, description, metadata }) => {
    const sql = `
      INSERT INTO activity_logs (user_id, action, entity_type, entity_id, description, metadata)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    try {
      const [result] = await pool.execute(sql, [
        user_id || null,
        action,
        entity_type || null,
        entity_id || null,
        description || null,
        metadata ? JSON.stringify(metadata) : null
      ]);
      return { id: result.insertId };
    } catch (err) {
      if (err.code === 'ER_NO_SUCH_TABLE') {
        console.warn('activity_logs table does not exist; skipping activity log');
        return null;
      }
      throw err;
    }
  },
  findPage: async (filters = {}) => {
    const { page, limit, offset } = pageArgs(filters.page, filters.limit);
    let where = 'WHERE 1=1';
    const params = [];
    if (filters.q) {
      where += " AND (al.description LIKE ? OR al.action LIKE ? OR REPLACE(al.action, '.', ' ') LIKE ? OR u.username LIKE ? OR u.full_name LIKE ?)";
      params.push(`%${filters.q}%`, `%${filters.q}%`, `%${filters.q}%`, `%${filters.q}%`, `%${filters.q}%`);
    }
    if (filters.action) {
      where += ' AND al.action = ?';
      params.push(filters.action);
    }
    if (filters.entity_type) {
      where += ' AND al.entity_type = ?';
      params.push(filters.entity_type);
    }
    if (filters.date_from) {
      where += ' AND al.created_at >= ?';
      params.push(filters.date_from);
    }
    if (filters.date_to) {
      where += ' AND al.created_at < DATE_ADD(?, INTERVAL 1 DAY)';
      params.push(filters.date_to);
    }
    try {
      const countRows = await query(`
        SELECT COUNT(*) AS total
        FROM activity_logs al
        LEFT JOIN users u ON u.id = al.user_id
        ${where}
      `, params);
      const rows = await query(`
        SELECT
          al.id, al.user_id, al.action, al.entity_type, al.entity_id,
          al.description, al.metadata, al.created_at,
          u.username, u.full_name
        FROM activity_logs al
        LEFT JOIN users u ON u.id = al.user_id
        ${where}
        ORDER BY al.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `, params);
      return pagedResult(rows.map(row => ({
        ...row,
        action_label: humanAction(row.action),
        entity_label: humanEntity(row.entity_type)
      })), countRows[0]?.total || 0, page, limit);
    } catch (err) {
      if (err.code === 'ER_NO_SUCH_TABLE') return pagedResult([], 0, page, limit);
      throw err;
    }
  },
  findAll: async (limit = 100) => {
    const result = await ActivityLog.findPage({ page: 1, limit });
    return result.rows;
  }
};

module.exports = { Roll, Leftover, Job, JobItem, OptimizationResult, Setting, User, ActivityLog, query };
