// server/src/routes/notifications.js
const express = require('express');
const Notification = require('../models/Notification');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// list notifications for current user
router.get('/', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;

    const notifications = await Notification.find({ user: userId })
      .sort({ createdAt: -1 });

    res.json(notifications);
  } catch (err) {
    console.error('List notifications error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// mark as read
router.put('/:id/read', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;

    const notification = await Notification.findById(id);

    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    // Security: only the owner can mark as read
    if (notification.user.toString() !== userId) {
      return res.status(403).json({ message: 'Not allowed to update this notification' });
    }

    notification.isRead = true;
    await notification.save();

    res.json(notification);
  } catch (err) {
    console.error('Mark notification read error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;