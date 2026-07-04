const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true,trim:true },
    description: { type: String , trim:true},
    status: {
      type: String,
      enum: ['todo', 'in_progress', 'done'],
      default: 'todo',
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium',
    },
    assignee: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    dueDate: { type: Date },
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
    },
    blockedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Task' }],
    blocks: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Task' }],
    comments: [
      {
        author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        body: String,
        createdAt: { type: Date, default: Date.now },
      },
    ],
    attachments: [{ url: String, name: String }],
    mentions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true }
);

module.exports = mongoose.model('Task', taskSchema);