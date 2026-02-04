// Mic.js - Mongoose Schema for Open Mic Events
const mongoose = require('mongoose');

const micSchema = new mongoose.Schema({
  // Basic Info
  name: {
    type: String,
    required: true,
    trim: true
  },
  day: {
    type: String,
    required: true,
    enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  },
  startTime: {
    type: String,
    required: true
  },
  endTime: {
    type: String,
    default: null
  },

  // Venue Information
  venueName: {
    type: String,
    required: true,
    trim: true
  },
  borough: {
    type: String,
    required: true,
    enum: ['Manhattan', 'Brooklyn', 'Queens', 'Bronx', 'Staten Island']
  },
  neighborhood: {
    type: String,
    trim: true
  },
  address: {
    type: String,
    trim: true
  },

  // Geospatial Data
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: false
    }
  },
  // Keep lat/lon as separate fields for backward compatibility
  lat: {
    type: Number,
    required: true
  },
  lon: {
    type: Number,
    required: true
  },

  // Details
  cost: {
    type: String,
    default: 'Free'
  },
  stageTime: {
    type: String,
    default: null
  },
  signUpDetails: {
    type: String,
    default: 'Check venue for details'
  },
  host: {
    type: String,
    default: 'TBD'
  },
  environment: {
    type: String,
    default: 'Public Venue'
  },
  notes: {
    type: String,
    default: null
  },

  // Warning (for venue safety alerts)
  warning: {
    message: {
      type: String,
      default: null
    },
    link: {
      type: String,
      default: null
    }
  },

  // Metadata
  lastUpdated: {
    type: Date,
    default: Date.now
  },
  score: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true // Adds createdAt and updatedAt automatically
});

// Indexes for performance
micSchema.index({ day: 1, startTime: 1 });  // Compound index for filtering by day and time
micSchema.index({ borough: 1 });            // Filter by borough
micSchema.index({ score: -1 });             // Sort by score (for Top Picks)
// TODO: Add geospatial index later when implementing radius queries
// micSchema.index({ location: '2dsphere' });  // Geospatial queries

// Pre-save hook to sync location coordinates with lat/lon
micSchema.pre('save', function(next) {
  if (this.isModified('lat') || this.isModified('lon')) {
    this.location = {
      type: 'Point',
      coordinates: [this.lon, this.lat] // [longitude, latitude] for GeoJSON
    };
  }
  next();
});

// Virtual for formatted cost
micSchema.virtual('costFormatted').get(function() {
  if (!this.cost || this.cost.toLowerCase() === 'free') {
    return 'Free';
  }
  return this.cost;
});

// Enable virtuals in JSON output
micSchema.set('toJSON', { virtuals: true });
micSchema.set('toObject', { virtuals: true });

const Mic = mongoose.model('Mic', micSchema);

module.exports = Mic;
