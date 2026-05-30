const { Product } = require('../models');

exports.getAll = async (req, res, next) => {
  try {
    const result = await Product.findPage(req.query);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

exports.getById = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ success: false, error: 'Product not found' });
    res.json({ success: true, data: product });
  } catch (err) {
    next(err);
  }
};

exports.create = async (req, res, next) => {
  try {
    const { product_name, product_code, unit, sale_rate } = req.body;
    if (!product_name || !product_code) {
      return res.status(400).json({ success: false, error: 'product_name and product_code are required' });
    }
    const product = await Product.create({ product_name, product_code, unit, sale_rate }, req.user?.id);
    res.status(201).json({ success: true, data: product });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, error: 'Product code already exists' });
    }
    next(err);
  }
};

exports.update = async (req, res, next) => {
  try {
    const { product_name, product_code, unit, sale_rate } = req.body;
    await Product.update(req.params.id, { product_name, product_code, unit, sale_rate });
    res.json({ success: true, message: 'Product updated' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, error: 'Product code already exists' });
    }
    next(err);
  }
};

exports.remove = async (req, res, next) => {
  try {
    await Product.delete(req.params.id);
    res.json({ success: true, message: 'Product deleted' });
  } catch (err) {
    next(err);
  }
};

exports.importBulk = async (req, res, next) => {
  try {
    const products = req.body.products;
    if (!Array.isArray(products) || products.length === 0) {
      return res.status(400).json({ success: false, error: 'products array is required' });
    }
    const clean = products
      .filter(p => p.product_name && p.product_code)
      .map(p => ({
        product_name: String(p.product_name).trim(),
        product_code: String(p.product_code).trim(),
        unit: String(p.unit || 'SQFT').trim(),
        sale_rate: p.sale_rate != null && !isNaN(Number(p.sale_rate)) ? Number(p.sale_rate) : null
      }));
    if (clean.length === 0) {
      return res.status(400).json({ success: false, error: 'No valid products found in import data' });
    }
    const result = await Product.bulkUpsert(clean, req.user?.id);
    res.json({ success: true, data: { processed: result.processed, total_sent: products.length } });
  } catch (err) {
    next(err);
  }
};

exports.lookup = async (req, res, next) => {
  try {
    const names = req.body.names;
    if (!Array.isArray(names)) {
      return res.json({ success: true, data: { found: [], unknown: [] } });
    }
    const result = await Product.lookup(names);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

exports.exportCSV = async (req, res, next) => {
  try {
    const rows = await Product.findAllForExport();
    const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = ['Product Name', 'Product Code', 'Unit', 'Sale Rate', 'Created By', 'Created At'].join(',');
    const lines = rows.map(r => [
      escape(r.product_name),
      escape(r.product_code),
      escape(r.unit),
      r.sale_rate != null ? r.sale_rate : '',
      escape(r.created_by_name || ''),
      r.created_at ? new Date(r.created_at).toISOString().slice(0, 10) : ''
    ].join(','));
    const csv = [header, ...lines].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="products.csv"');
    res.send(csv);
  } catch (err) {
    next(err);
  }
};
