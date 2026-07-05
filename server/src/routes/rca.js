// server/src/routes/rca.js
const express = require('express');
const Rca = require('../models/Rca');
const { requireAuth } = require('../middleware/auth');
const { emitNotification } = require('../events');
const { logActivity } = require('../utils/activity');

const router = express.Router();

function computeRcaStatus(rca) {
  // If no reviews yet, keep current status
  if (!rca.reviews || rca.reviews.length === 0) {
    return rca.status;
  }

  const reviewerIds = rca.reviewers.map((r) => r.toString());
  const decisionsByReviewer = new Map();

  rca.reviews.forEach((rev) => {
    decisionsByReviewer.set(rev.reviewer.toString(), rev.decision);
  });

  const hasReject = reviewerIds.some(
    (revId) => decisionsByReviewer.get(revId) === 'rejected'
  );

  if (hasReject) {
    return 'submitted';
  }

  const allApproved =
    reviewerIds.length > 0 &&
    reviewerIds.every(
      (revId) => decisionsByReviewer.get(revId) === 'approved'
    );

  if (allApproved) {
    return 'reviewed';
  }
  return 'submitted';
}

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
    const { task,title,timeline,contributingFactors,correctiveActions,preventiveMeasures, reviewers } = req.body;

    if (!title || !task) {
      return res.status(400).json({ message: 'Title and task are required' });
    }

    const rca = await Rca.create({
      task,
      title,
      timeline: timeline || '',
      contributingFactors: contributingFactors || '',
      correctiveActions: correctiveActions || '',
      preventiveMeasures: preventiveMeasures || '',
      status: 'draft',
      owner: userId,
      reviewers: reviewers || [],
      reviews: [],
      comments: [],
      attachments: []
    });
    await logActivity({
  entityType: 'rca',
  entityId: rca._id,
  actor: req.user.userId,
  action: 'RCA_CREATED',
  payload: {
    task: rca.task,
    title: rca.title,
    status: rca.status,
  },
});

return res.status(201).json(rca);


  } catch (err) {
    console.error('Create RCA error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

//  update/submit/review RCA
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const userRole = req.user.role;
    const { id } = req.params;
    const { title,timeline,contributingFactors,correctiveActions,preventiveMeasures, reviewers,submit,reviewDecision } = req.body;

    const rca = await Rca.findById(id);

    if (!rca) {
      return res.status(404).json({ message: 'RCA not found' });
    }

    const isOwner = rca.owner.toString() === userId;
    const isReviewer = rca.reviewers.some((r) => r.toString() === userId);

     if (isOwner && rca.status === 'draft') {
      if (title !== undefined) rca.title = title;
      if (timeline !== undefined) rca.timeline = timeline;
      if (contributingFactors !== undefined) rca.contributingFactors = contributingFactors;
      if (correctiveActions !== undefined) rca.correctiveActions = correctiveActions;
      if (preventiveMeasures !== undefined) rca.preventiveMeasures = preventiveMeasures;
      if (Array.isArray(reviewers)) rca.reviewers = reviewers;
    }

    if (isOwner && submit === true && rca.status === 'draft') {
      if (!rca.reviewers || rca.reviewers.length === 0) {
    return res.status(400).json({
      message: 'Cannot submit RCA without reviewers',
    });
  }
      rca.status = 'submitted';
      await rca.save();

      await logActivity({
    entityType: 'rca',
    entityId: rca._id,
    actor: req.user.userId,
    action: 'RCA_SUBMITTED',
    payload: {
      status: rca.status,
    },
  });

      for (const reviewerId of rca.reviewers) {
        emitNotification(
          reviewerId,
          'rca_submitted',
          `RCA "${rca.title}" has been submitted for review`,
          rca._id.toString()
        );
      }

      return res.json(rca);
    }
    if (reviewDecision && isReviewer && rca.status === 'submitted') {
      const { decision, comment } = reviewDecision;

      if (!decision || !comment) {
        return res.status(400).json({
          message: 'Decision and comment are required for review',
          reason: 'MISSING_REVIEW_COMMENT',
        });
      }

      if (!['approved', 'rejected'].includes(decision)) {
        return res.status(400).json({ message: 'Invalid decision value' });
      }

      const existingIndex = rca.reviews.findIndex(
    (rev) => rev.reviewer.toString() === userId
  );

       if (existingIndex >= 0) {
    // Update previous decision
    rca.reviews[existingIndex].decision = decision;
    rca.reviews[existingIndex].comment = comment;
    rca.reviews[existingIndex].decidedAt = new Date();
  } else {
    rca.reviews.push({
      reviewer: userId,
      decision,
      comment,
      decidedAt: new Date(),
    });
  }
      rca.status = computeRcaStatus(rca);
       await rca.save();

      emitNotification(
        rca.owner,
        'rca_review_decision',
        `Reviewer updated RCA "${rca.title}" with decision "${decision}"`,
        rca._id.toString()
      );

      return res.json(rca);
    }

    await rca.save();

    await logActivity({
  entityType: 'rca',
  entityId: rca._id,
  actor: req.user.userId,
  action: 'RCA_REVIEW_DECISION',
  payload: {
    decision,
    comment,
    statusAfter: rca.status,
  },
});

    res.json(rca);
  } catch (err) {
    console.error('Update RCA error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/:id/override', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const userRole = req.user.role;
    const { id } = req.params;
    const { newReviewers, forceClose, reason } = req.body;

    if (userRole !== 'admin') {
      return res.status(403).json({ message: 'Admin override not allowed for this user' });
    }

    const rca = await Rca.findById(id);
    if (!rca) {
      return res.status(404).json({ message: 'RCA not found' });
    }
    if (Array.isArray(newReviewers)) {
      rca.reviewers = newReviewers;
      rca.reviews = []; 
      rca.status = 'submitted'; 
    }

    if (forceClose === true) {
      rca.status = 'reviewed';
    }

    await rca.save();

    await logActivity({
  entityType: 'rca',
  entityId: rca._id,
  actor: req.user.userId,
  action: 'RCA_ADMIN_OVERRIDE',
  payload: {
    newReviewers: newReviewers || null,
    forceClose: !!forceClose,
    statusAfter: rca.status,
    reason: reason || null,
  },
});

    emitNotification(
  rca.owner,
  'rca_admin_override',
  `Admin overrode RCA "${rca.title}" (reason: "${reason || 'Admin override'}")`,
  rca._id.toString()
);

    res.json({
      rca,
      override: {
        by: userId,
        reason: reason || 'Admin override',
      },
    });
  } catch (err) {
    console.error('Admin override RCA error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;