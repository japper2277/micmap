const mongoose = require('mongoose');

const stopSchema = new mongoose.Schema({
  micId: {
    type: String,
    required: true,
    trim: true
  },
  stayMins: {
    type: Number,
    default: 45,
    min: 15,
    max: 240
  },
  order: {
    type: Number,
    required: true,
    min: 0
  },
  addedBy: {
    type: String,
    default: 'planner',
    trim: true
  },
  micSnapshot: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  addedAt: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

const responseSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  normalizedName: {
    type: String,
    required: true,
    trim: true
  },
  response: {
    type: String,
    required: true,
    enum: ['in', 'maybe', 'meet_later']
  },
  targetMicId: {
    type: String,
    required: true,
    trim: true
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

const suggestionSchema = new mongoose.Schema({
  type: {
    type: String,
    required: true,
    enum: ['add_stop', 'set_meetup']
  },
  status: {
    type: String,
    default: 'open',
    enum: ['open', 'applied', 'dismissed']
  },
  authorName: {
    type: String,
    required: true,
    trim: true
  },
  normalizedAuthorName: {
    type: String,
    required: true,
    trim: true
  },
  proposedMicId: {
    type: String,
    default: null,
    trim: true
  },
  proposedMicSnapshot: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  targetMicId: {
    type: String,
    default: null,
    trim: true
  },
  note: {
    type: String,
    default: '',
    trim: true,
    maxlength: 240
  },
  appliedBy: {
    type: String,
    default: null,
    trim: true
  },
  appliedAt: {
    type: Date,
    default: null
  },
  dismissedBy: {
    type: String,
    default: null,
    trim: true
  },
  dismissedAt: {
    type: Date,
    default: null
  }
}, { timestamps: true });

const activitySchema = new mongoose.Schema({
  type: {
    type: String,
    required: true,
    trim: true
  },
  actorName: {
    type: String,
    default: 'Someone',
    trim: true
  },
  message: {
    type: String,
    required: true,
    trim: true
  },
  micId: {
    type: String,
    default: null,
    trim: true
  },
  suggestionId: {
    type: String,
    default: null,
    trim: true
  },
  meta: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

const sharedPlanSchema = new mongoose.Schema({
  shareId: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true
  },
  plannerName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 60
  },
  plannerNote: {
    type: String,
    default: '',
    trim: true,
    maxlength: 240
  },
  appBaseUrl: {
    type: String,
    default: 'https://micfinder.io/',
    trim: true,
    maxlength: 500
  },
  apiBaseUrl: {
    type: String,
    default: '',
    trim: true,
    maxlength: 500
  },
  status: {
    type: String,
    default: 'active',
    enum: ['active', 'expired']
  },
  revision: {
    type: Number,
    default: 1,
    min: 1
  },
  stops: {
    type: [stopSchema],
    default: []
  },
  meetupStopId: {
    type: String,
    default: null,
    trim: true
  },
  responses: {
    type: [responseSchema],
    default: []
  },
  suggestions: {
    type: [suggestionSchema],
    default: []
  },
  activity: {
    type: [activitySchema],
    default: []
  },
  expiresAt: {
    type: Date,
    required: true
  }
}, { timestamps: true });

sharedPlanSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const SharedPlan = mongoose.model('SharedPlan', sharedPlanSchema);

module.exports = SharedPlan;
