// server/src/routes/activity.js
const express = require('express');
const router = express.Router();
const ActivityLog = require('../models/ActivityLog');
const { requireAuth } = require('../middleware/auth');

router.get('/', requireAuth, async (req, res) => {
  try {
    const { entityType, entityId } = req.query;

    const query = {};
    if (entityType) query.entityType = entityType;
    if (entityId) query.entityId = entityId;

    const logs = await ActivityLog.find(query)
      .sort({ createdAt: -1 })
      .limit(200)
      .populate('actor', 'name email');

    res.json(logs);
  } catch (err) {
    console.error('Get activity logs error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;