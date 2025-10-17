const express = require('express');
const router = express.Router();
const { body, query, validationResult } = require('express-validator');
const pool = require('../db'); // adapter selon votre config db
const { requireAuth, requireRole } = require('../middleware/auth');

function handleValidation(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return false;
  }
  return true;
}

router.get('/', requireAuth, [query('q').optional().isString(), query('limit').optional().isInt({ min: 1, max: 100 }).toInt(), query('page').optional().isInt({ min: 1 }).toInt()], async (req, res) => {
  if (!handleValidation(req, res)) return;
  const q = req.query.q || '';
  const limit = req.query.limit || 20;
  const page = req.query.page || 1;
  const offset = (page - 1) * limit;
  try {
    const params = [`%${q.toLowerCase()}%`, limit, offset];
    const result = await pool.query(`SELECT id, name, code, description, parent_id FROM departments WHERE LOWER(name) LIKE $1 OR LOWER(code) LIKE $1 ORDER BY name LIMIT $2 OFFSET $3`, params);
    const countRes = await pool.query(`SELECT count(*) FROM departments WHERE LOWER(name) LIKE $1 OR LOWER(code) LIKE $1`, [params[0]]);
    res.json({ data: result.rows, meta: { total: parseInt(countRes.rows[0].count, 10), page, limit } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/:id', requireAuth, async (req, res) => {
  const id = req.params.id;
  try {
    const svc = await pool.query(`SELECT id, name, code, description, parent_id FROM departments WHERE id=$1`, [id]);
    if (svc.rowCount === 0) return res.status(404).json({ error: 'Service non trouvé' });
    const users = await pool.query(`SELECT u.id, u.full_name, u.email, su.role_in_service FROM users u JOIN service_users su ON su.user_id = u.id WHERE su.service_id = $1`, [id]);
    res.json({ ...svc.rows[0], users: users.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/', requireAuth, requireRole(['admin', 'chef_service']), [ body('name').isLength({ min: 3 }), body('code').optional().isString() ], async (req, res) => {
  if (!handleValidation(req, res)) return;
  const { name, code, description, parent_id } = req.body;
  try {
    if (code) {
      const existing = await pool.query(`SELECT id FROM departments WHERE LOWER(code)=LOWER($1)`, [code]);
      if (existing.rowCount > 0) return res.status(409).json({ error: 'Code déjà utilisé' });
    }
    const insert = await pool.query(`INSERT INTO departments (name, code, description, parent_id) VALUES ($1,$2,$3,$4) RETURNING id,name,code,description,parent_id`, [name, code, description, parent_id || null]);
    res.status(201).json(insert.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.put('/:id', requireAuth, requireRole(['admin', 'chef_service']), [ body('name').optional().isLength({ min: 3 }) ], async (req, res) => {
  if (!handleValidation(req, res)) return;
  const id = req.params.id;
  const { name, code, description, parent_id } = req.body;
  try {
    const update = await pool.query(`UPDATE departments SET name = COALESCE($1, name), code = COALESCE($2, code), description = COALESCE($3, description), parent_id = COALESCE($4, parent_id) WHERE id=$5 RETURNING id,name,code,description,parent_id`, [name, code, description, parent_id || null, id]);
    if (update.rowCount === 0) return res.status(404).json({ error: 'Service non trouvé' });
    res.json(update.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.delete('/:id', requireAuth, requireRole(['admin']), async (req, res) => {
  const id = req.params.id;
  try {
    const docCheck = await pool.query(`SELECT count(*) FROM documents WHERE department_id = $1`, [id]);
    if (parseInt(docCheck.rows[0].count, 10) > 0) {
      return res.status(409).json({ error: 'Il existe des documents liés. Re-affectez-les avant suppression.' });
    }
    await pool.query(`DELETE FROM departments WHERE id=$1`, [id]);
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/:id/users', requireAuth, requireRole(['admin','chef_service']), [ body('user_id').isInt(), body('role_in_service').optional().isString() ], async (req, res) => {
  if (!handleValidation(req, res)) return;
  const serviceId = req.params.id;
  const { user_id, role_in_service } = req.body;
  try {
    await pool.query(`INSERT INTO service_users (service_id, user_id, role_in_service) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [serviceId, user_id, role_in_service || null]);
    res.status(201).json({ service_id: serviceId, user_id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;