// server/src/routes/analytics.js
const express = require('express');
const { requireAuth } = require('../middleware/auth');
const Project = require('../models/Project');
const Task = require('../models/Task');
const Rca = require('../models/Rca');

const router = express.Router();

// summary
router.get('/summary', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;

    // Projects where user is owner or member
    const projectFilter = {
      $or: [{ owner: userId }, { members: userId }],
    };

    const [projectCount, taskCount, overdueTaskCount, rcaDraft, rcaSubmitted, rcaReviewed] =
      await Promise.all([
        Project.countDocuments(projectFilter),

        Task.countDocuments({}), 

        Task.countDocuments({
          status: { $ne: 'done' },
          dueDate: { $lt: new Date() },
        }),

        Rca.countDocuments({ status: 'draft' }),
        Rca.countDocuments({ status: 'submitted' }),
        Rca.countDocuments({ status: 'reviewed' }),
      ]);

    res.json({
      projectCount,
      taskCount,
      overdueTaskCount,
      rcaByStatus: {
        draft: rcaDraft,
        submitted: rcaSubmitted,
        reviewed: rcaReviewed,
      },
    });
  } catch (err) {
    console.error('Analytics summary error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

//  CSV export of tasks
router.get('/export', requireAuth, async (req, res) => {
  try {
    const tasks = await Task.find({})
      .populate('project', 'name')
      .populate('assignee', 'name email');

    // Build CSV rows
    const header = 'Project,Task,Status,Priority,Assignee,DueDate\n';

    const rows = tasks
      .map((t) => {
        const projectName = t.project ? t.project.name : '';
        const assigneeName = t.assignee ? t.assignee.name : '';
        const dueDate = t.dueDate ? t.dueDate.toISOString() : '';

        // Escape commas by wrapping fields in quotes if needed
        return [
          projectName,
          t.title,
          t.status,
          t.priority,
          assigneeName,
          dueDate,
        ]
          .map((field) => `"${String(field).replace(/"/g, '""')}"`)
          .join(',');
      })
      .join('\n');

    const csv = header + rows;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="analytics_tasks.csv"');
    res.status(200).send(csv);
  } catch (err) {
    console.error('Analytics export error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;