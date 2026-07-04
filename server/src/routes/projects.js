// server/src/routes/projects.js
const express = require('express');
const Project = require('../models/Project');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// list projects the user owns or is a member of
router.get('/', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;

    const projects = await Project.find({
      $or: [{ owner: userId }, { members: userId }],
    }).sort({ createdAt: -1 });

    res.json(projects);
  } catch (err) {
    console.error('List projects error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// create a new project
router.post('/', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { name, description, members, viewPreference } = req.body;

    if (!name) {
      return res.status(400).json({ message: 'Project name is required' });
    }

    const project = await Project.create({
      name,
      description,
      owner: userId,
      members: members || [],
      viewPreference: viewPreference || 'kanban',
    });

    res.status(201).json(project);
  } catch (err) {
    console.error('Create project error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

//  get project detail
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;

    const project = await Project.findById(id).populate('owner members', 'name email role');

    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    // Simple access check: owner or member
    const isOwner = project.owner && project.owner._id.toString() === userId;
    const isMember = project.members.some((m) => m._id.toString() === userId);

    if (!isOwner && !isMember) {
      return res.status(403).json({ message: 'Not allowed to view this project' });
    }

    res.json(project);
  } catch (err) {
    console.error('Get project error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

//  update project
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;
    const { name, description, members, viewPreference } = req.body;

    const project = await Project.findById(id);

    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    const isOwner = project.owner.toString() === userId;
    if (!isOwner) {
      return res.status(403).json({ message: 'Only owner can update project' });
    }

    if (name !== undefined) project.name = name;
    if (description !== undefined) project.description = description;
    if (Array.isArray(members)) project.members = members;
    if (viewPreference !== undefined) project.viewPreference = viewPreference;

    await project.save();

    res.json(project);
  } catch (err) {
    console.error('Update project error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

//  delete project
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;

    const project = await Project.findById(id);

    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    const isOwner = project.owner.toString() === userId;
    if (!isOwner) {
      return res.status(403).json({ message: 'Only owner can delete project' });
    }

    await project.deleteOne();

    res.json({ message: 'Project deleted' });
  } catch (err) {
    console.error('Delete project error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

//  update per-project membership and roles
router.put('/:id/members', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const userRole = req.user.role;
    const { id } = req.params;
    const { members } = req.body; 

    const project = await Project.findById(id);

    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    const isOwner = project.owner.toString() === userId;
    const isGlobalAdmin = userRole === 'admin';

    if (!isOwner && !isGlobalAdmin) {
      return res.status(403).json({ message: 'Only owner or admin can update project members' });
    }

    if (!Array.isArray(members)) {
      return res.status(400).json({ message: 'Members must be an array' });
    }

    // Basic validation: each entry must have user + valid role
    const sanitizedMembers = members.map((m) => ({
      user: m.user,
      role: ['admin', 'member', 'viewer'].includes(m.role) ? m.role : 'member',
    }));

    project.members = sanitizedMembers;
    await project.save();

    res.json(project);
  } catch (err) {
    console.error('Update project members error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;