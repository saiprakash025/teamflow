// server/src/routes/rca.js
const express = require('express');
const Rca = require('../models/Rca');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

//  list RCA reports 
router.get('/', requireAuth, async (req, res) => {
  try {
    const rcas = await Rca.find()
      .populate('owner', 'name email')
      .populate('reviewers', 'name email')
      .sort({ createdAt: -1 });

    res.json(rcas);
  } catch (err) {
    console.error('List RCA error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

//  create RCA 
router.post('/', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { title, description, reviewers, findings, actions } = req.body;

    if (!title || !description) {
      return res.status(400).json({ message: 'Title and description are required' });
    }

    const rca = await Rca.create({
      title,
      description,
      status: 'draft',
      owner: userId,
      reviewers: reviewers || [],
      findings: findings || '',
      actions: actions || [],
    });

    res.status(201).json(rca);
  } catch (err) {
    console.error('Create RCA error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

//  update/submit/review RCA
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;
    const { title, description, status, reviewers, findings, actions } = req.body;

    const rca = await Rca.findById(id);

    if (!rca) {
      return res.status(404).json({ message: 'RCA not found' });
    }

    const isOwner = rca.owner.toString() === userId;
    const isReviewer = rca.reviewers.some((r) => r.toString() === userId);

    // Only owner can edit content or submit; reviewers can mark reviewed
    if (!isOwner && !isReviewer) {
      return res.status(403).json({ message: 'Not allowed to update this RCA' });
    }

    // Basic field updates (owner or reviewer)
    if (title !== undefined && isOwner) rca.title = title;
    if (description !== undefined && isOwner) rca.description = description;
    if (Array.isArray(reviewers) && isOwner) rca.reviewers = reviewers;
    if (findings !== undefined) rca.findings = findings;
    if (Array.isArray(actions)) rca.actions = actions;

    // Status transitions
    if (status) {
      // draft -> submitted (owner)
      if (rca.status === 'draft' && status === 'submitted' && isOwner) {
        rca.status = 'submitted';
      }
      // submitted -> reviewed (reviewer)
      else if (rca.status === 'submitted' && status === 'reviewed' && isReviewer) {
        rca.status = 'reviewed';
      } else {
        // Invalid transition; you can choose to return 400 or ignore
        return res.status(400).json({ message: 'Invalid status transition' });
      }
    }

    await rca.save();

    res.json(rca);
  } catch (err) {
    console.error('Update RCA error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;