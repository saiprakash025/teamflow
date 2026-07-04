// server/src/routes/tasks.js
const express = require('express');
const Task = require('../models/Task');
const Project = require('../models/Project');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();


async function hasCircularDependency(taskId, blockedById) {
  return false;
}

//  list tasks 
router.get('/', requireAuth, async (req, res) => {
  try {
    const { project, status, assignee } = req.query;
    const userId = req.user.userId;

    const filter = {};

    if (project) {
      filter.project = project;
    }

    if (status) {
      filter.status = status;
    }

    if (assignee) {
      filter.assignee = assignee;
    }

    // Optional: only tasks in projects the user can see
    const tasks = await Task.find(filter)
      .populate('assignee', 'name email')
      .populate('project', 'name')
      .sort({ dueDate: 1, createdAt: -1 });

    res.json(tasks);
  } catch (err) {
    console.error('List tasks error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

//  create task
router.post('/', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const {
      title,
      description,
      status,
      priority,
      assignee,
      dueDate,
      project,
      attachments,
      comments,
      mentions,
    } = req.body;

    if (!title || !project) {
      return res.status(400).json({ message: 'Title and project are required' });
    }

    //  ensure project exists
    const projectDoc = await Project.findById(project);
    if (!projectDoc) {
      return res.status(400).json({ message: 'Invalid project' });
    }

    const task = await Task.create({
      title,
      description,
      status: status || 'todo',
      priority: priority || 'medium',
      assignee,
      dueDate,
      project,
      attachments: attachments || [],
      comments: comments || [],
      mentions: mentions || [],
    });

    res.status(201).json(task);
  } catch (err) {
    console.error('Create task error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

//  update task
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      description,
      status,
      priority,
      assignee,
      dueDate,
      attachments,
      comments,
      mentions,
    } = req.body;

    const task = await Task.findById(id);

    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    if (title !== undefined) task.title = title;
    if (description !== undefined) task.description = description;
    if (status !== undefined) task.status = status;
    if (priority !== undefined) task.priority = priority;
    if (assignee !== undefined) task.assignee = assignee;
    if (dueDate !== undefined) task.dueDate = dueDate;
    if (attachments !== undefined) task.attachments = attachments;
    if (comments !== undefined) task.comments = comments;
    if (mentions !== undefined) task.mentions = mentions;

    await task.save();

    res.json(task);
  } catch (err) {
    console.error('Update task error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// delete task
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const task = await Task.findById(id);

    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    await task.deleteOne();

    res.json({ message: 'Task deleted' });
  } catch (err) {
    console.error('Delete task error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// - add dependency
router.post('/:id/dependencies', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { blockedBy, blocks } = req.body;

    const task = await Task.findById(id);
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    // Handle blockedBy
    if (blockedBy) {
      const circular = await hasCircularDependency(id, blockedBy);
      if (circular) {
        return res.status(400).json({ message: 'Circular dependency detected' });
      }
      if (!task.blockedBy.includes(blockedBy)) {
        task.blockedBy.push(blockedBy);
      }
    }

    // Handle blocks
    if (blocks) {
      if (!task.blocks.includes(blocks)) {
        task.blocks.push(blocks);
      }
    }

    await task.save();

    res.json(task);
  } catch (err) {
    console.error('Update dependencies error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;