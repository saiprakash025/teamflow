// server/src/routes/tasks.js
const express = require('express');
const Task = require('../models/Task');
const Project = require('../models/Project');
const ProjectTaskLink = require('../models/ProjectTaskLink');
const { requireAuth } = require('../middleware/auth');
const { emitNotification } = require('../events');
const { logActivity } = require('../utils/activity');

const router = express.Router();


async function hasCircularDependency(taskId, newBlockedById){
  const visited = new Set();

  async function dfs(currentId) {
    if (visited.has(currentId)) return false;
    visited.add(currentId);

    // If we reach the original task, we have a cycle
    if (currentId.toString() === taskId.toString()) {
      return true;
    }

    const currentTask = await Task.findById(currentId).select('blockedBy');
    if (!currentTask) return false;

    for (const blocker of currentTask.blockedBy) {
      const result = await dfs(blocker.toString());
      if (result) return true;
    }

    return false;
  }

  return dfs(newBlockedById.toString());
}

//  list tasks 
router.get('/', requireAuth, async (req, res) => {
  try {
    const { project, status, assignee } = req.query;

    const filter = {};
    if (project) filter.project = project;
    if (status) filter.status = status;
    if (assignee) filter.assignee = assignee;
     
    //Direct tasks
    const directTasks = await Task.find(filter)
      .populate('assignee', 'name email')
      .populate('project', 'name');

    let allTasks = directTasks;

    if (project) {
      const links = await ProjectTaskLink.find({ project }).populate({
        path: 'task',
        populate: [
          { path: 'assignee', select: 'name email' },
          { path: 'project', select: 'name' },
        ],
      });

      const linkedTasks = links.map((l) => l.task);

      // Merge direct + linked, avoiding duplicates by _id
      const seen = new Set(directTasks.map((t) => t._id.toString()));
      linkedTasks.forEach((t) => {
        if (!seen.has(t._id.toString())) {
          allTasks.push(t);
          seen.add(t._id.toString());
        }
      });
  
    }


   allTasks.sort((a, b) => {
      const da = a.dueDate || a.createdAt;
      const db = b.dueDate || b.createdAt;
      return da - db;
    });

    res.json(allTasks);
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

    await logActivity({
  entityType: 'task',
  entityId: task._id,
  actor: req.user.userId,
  action: 'TASK_CREATED',
  payload: {
    title: task.title,
    status: task.status,
    assignee: task.assignee,
    project: task.project,
  },
});

    if (task.assignee) {
  emitNotification(
    task.assignee,
    'task_assignment',
    `You have been assigned to task "${task.title}"`,
    task._id.toString()
  );
}

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
      parent,
    } = req.body;


    const task = await Task.findById(id).populate('blockedBy', 'status');

    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    const previousStatus = task.status;
    const previousAssignee = task.assignee ? task.assignee.toString() : null;
    const previousBlockedBy = task.blockedBy.map((d) => d._id.toString());

    if (status && status === 'done') {
      const hasOpenBlocker = task.blockedBy.some(
        (blocker) => blocker.status !== 'done'
      );

      if (hasOpenBlocker) {
        return res.status(400).json({
          message: 'Illegal status transition',
          reason: 'OPEN_BLOCKERS',
        });
      }
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
    if (parent !== undefined) task.parent = parent;

    await task.save();

    // Status change
if (status !== undefined && status !== previousStatus) {
  await logActivity({
    entityType: 'task',
    entityId: task._id,
    actor: req.user.userId,
    action: 'TASK_STATUS_CHANGED',
    payload: {
      from: previousStatus,
      to: task.status,
    },
  });
}

// Assignee change
const newAssignee = task.assignee ? task.assignee.toString() : null;
if (newAssignee !== previousAssignee) {
  await logActivity({
    entityType: 'task',
    entityId: task._id,
    actor: req.user.userId,
    action: 'TASK_REASSIGNED',
    payload: {
      from: previousAssignee,
      to: newAssignee,
    },
  });
}

// Dependency changes
const newBlockedBy = task.blockedBy.map((d) => d._id.toString());
if (JSON.stringify(previousBlockedBy) !== JSON.stringify(newBlockedBy)) {
  await logActivity({
    entityType: 'task',
    entityId: task._id,
    actor: req.user.userId,
    action: 'TASK_DEPENDENCIES_UPDATED',
    payload: {
      from: previousBlockedBy,
      to: newBlockedBy,
    },
  });
}


  await task.populate('assignee', 'name email');

   // Status change notification
  if (status !== undefined && status !== previousStatus) {
    if (task.assignee) {
      emitNotification(
        task.assignee._id,
        'task_status_change',
        `Task "${task.title}" changed to status "${task.status}"`,
        task._id.toString()
      );
    }
  }

  // Assignment change notification
  const newAssigneeId = task.assignee ? task.assignee._id.toString() : null;
  if (newAssigneeId && newAssigneeId !== previousAssignee) {
    emitNotification(
      task.assignee._id,
      'task_assignment',
      `You have been assigned to task "${task.title}"`,
      task._id.toString()
    );
  }


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

    const task = await Task.findById(id).populate('blockedBy', 'status title');
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    // Handle blockedBy
    if (blockedBy) {
      const circular = await hasCircularDependency(id, blockedBy);
      if (circular) {
        return res.status(400).json({ message: 'Circular dependency detected',
          reason: 'CIRCULAR_DEPENDENCY' });
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

   await task.populate('blockedBy', 'status title');
    const unresolvedBlockers = task.blockedBy.filter(
      (blocker) => blocker.status !== 'done'
    );

    const warning =
      unresolvedBlockers.length > 0
        ? {
            type: 'UNRESOLVED_BLOCKERS',
            count: unresolvedBlockers.length,
            blockers: unresolvedBlockers.map((b) => ({
              id: b._id,
              title: b.title,
              status: b.status,
            })),
          }
        : null;

    res.json({
      task,
      warning,
    });
  } catch (err) {
    console.error('Update dependencies error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;