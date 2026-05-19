const { query } = require('../models');

exports.getSummary = async (req, res, next) => {
  try {
    const [summary] = await query(`
      SELECT
        COUNT(*) AS total_jobs,
        COALESCE(SUM(total_pieces), 0) AS total_pieces,
        COALESCE(AVG(NULLIF(total_utilization_percent, 0)), 0) AS avg_utilization,
        COALESCE(SUM(total_sheets), 0) AS total_sheets
      FROM jobs
    `, []);

    const recentJobs = await query(`
      SELECT *
      FROM jobs
      ORDER BY created_at DESC
      LIMIT 5
    `, []);

    let recentActivity = [];
    if (req.user?.role === 'admin') {
      try {
        recentActivity = await query(`
          SELECT
            al.id, al.user_id, al.action, al.entity_type, al.entity_id,
            al.description, al.metadata, al.created_at,
            u.username, u.full_name
          FROM activity_logs al
          LEFT JOIN users u ON u.id = al.user_id
          ORDER BY al.created_at DESC
          LIMIT 5
        `, []);
      } catch (err) {
        if (err.code !== 'ER_NO_SUCH_TABLE') throw err;
      }
    }

    res.json({
      success: true,
      data: {
        summary: {
          total_jobs: Number(summary?.total_jobs || 0),
          total_pieces: Number(summary?.total_pieces || 0),
          total_sheets: Number(summary?.total_sheets || 0),
          avg_utilization: Number(summary?.avg_utilization || 0)
        },
        recent_jobs: recentJobs,
        recent_activity: recentActivity
      }
    });
  } catch (err) {
    next(err);
  }
};
