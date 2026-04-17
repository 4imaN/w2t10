const crypto = require('crypto');
const mongoose = require('mongoose');
const { hashPassword } = require('../utils/crypto');
const User = require('../models/User');
const ConfigDictionary = require('../models/ConfigDictionary');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/cineride';

/**
 * Generate a random password: 16 chars, mixed case + digits + symbol.
 */
function generatePassword() {
  return crypto.randomBytes(12).toString('base64url').slice(0, 16) + '!A1';
}

async function seed(skipConnect = false) {
  if (!skipConnect) {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB for seeding');
  }

  // Bootstrap users with fixed demo passwords.
  // All accounts require password change on first login.
  const DEMO_PASSWORDS = {
    administrator: 'DemoAdmin123!',
    editor: 'DemoEditor123!',
    reviewer: 'DemoReviewer123!',
    dispatcher: 'DemoDispatch123!',
    regular_user: 'DemoUser123!'
  };

  const roles = [
    { username: 'admin', role: 'administrator', display_name: 'System Admin' },
    { username: 'editor1', role: 'editor', display_name: 'Jane Editor' },
    { username: 'reviewer1', role: 'reviewer', display_name: 'Bob Reviewer' },
    { username: 'reviewer2', role: 'reviewer', display_name: 'Carol Reviewer' },
    { username: 'dispatcher1', role: 'dispatcher', display_name: 'Dan Dispatcher' },
    { username: 'user1', role: 'regular_user', display_name: 'Eve User' },
  ];

  const createdCredentials = [];

  for (const u of roles) {
    const exists = await User.findOne({ username: u.username });
    if (!exists) {
      const password = DEMO_PASSWORDS[u.role];
      await User.create({
        username: u.username,
        password_hash: await hashPassword(password),
        role: u.role,
        display_name: u.display_name,
        must_change_password: true,
        phone: null
      });
      createdCredentials.push({ username: u.username, role: u.role, password });
    }
  }

  if (createdCredentials.length > 0) {
    const fs = require('fs');
    const path = require('path');
    const credDir = process.env.UPLOAD_DIR || path.resolve(__dirname, '../../../uploads');
    fs.mkdirSync(credDir, { recursive: true });
    const credFile = path.join(credDir, '.bootstrap-credentials');

    let content = 'CineRide Bootstrap Credentials\n';
    content += 'Generated: ' + new Date().toISOString() + '\n';
    content += 'All accounts require password change on first login.\n';
    content += 'DELETE THIS FILE after saving the credentials.\n\n';
    for (const c of createdCredentials) {
      content += `${c.username.padEnd(14)} ${c.role.padEnd(16)} ${c.password}\n`;
    }

    fs.writeFileSync(credFile, content, { mode: 0o600 });

    console.log(`Bootstrap credentials written to: ${credFile}`);
    console.log('Read and delete that file after saving the credentials.');
    console.log(`${createdCredentials.length} accounts created. All require password change on first login.`);
  }

  // Seed config dictionary
  const configs = [
    { key: 'auto_cancel_minutes', value: 30, category: 'thresholds', description: 'Minutes before unmatched ride requests auto-cancel' },
    { key: 'free_cancel_window_minutes', value: 5, category: 'thresholds', description: 'Minutes after posting within which cancellation is free' },
    { key: 'dispute_escalation_hours', value: 24, category: 'thresholds', description: 'Hours before unresolved disputes are flagged for escalation' },
    { key: 'reminder_threshold_minutes', value: 15, category: 'thresholds', description: 'Minutes before ride window to send reminder' },
    { key: 'sensor_retention_days', value: 180, category: 'thresholds', description: 'Days to retain sensor readings' },
    { key: 'config_cache_seconds', value: 60, category: 'thresholds', description: 'Seconds between config cache refreshes' },
    { key: 'ledger_max_retries', value: 3, category: 'thresholds', description: 'Maximum retry attempts for failed ledger postings' },
    { key: 'extension_rate_limit', value: 120, category: 'thresholds', description: 'Requests per minute per extension client' },
    { key: 'time_drift_threshold_seconds', value: 300, category: 'thresholds', description: 'Seconds of time drift before flagging sensor reading' },
    { key: 'vehicle_types', value: ['sedan', 'suv', 'van', 'shuttle'], category: 'vehicle_types', description: 'Available vehicle types for ride requests' },
    { key: 'mpaa_ratings', value: ['G', 'PG', 'PG-13', 'R', 'NC-17', 'NR'], category: 'ratings', description: 'MPAA-style movie rating values' },
    { key: 'movie_categories', value: ['Action', 'Comedy', 'Drama', 'Horror', 'Sci-Fi', 'Romance', 'Documentary', 'Animation', 'Thriller', 'Family'], category: 'tags', description: 'Default movie categories' },
    { key: 'featured_tags', value: ['staff-pick', 'new-release', 'classic', 'family-friendly'], category: 'tags', description: 'Editor-curated featured tags for cold-start recommendations' },
    { key: 'sensitive_words', value: ['violence', 'explicit', 'graphic', 'disturbing', 'offensive', 'hate', 'slur'], category: 'sensitive_words', description: 'Words that trigger a warning banner before content submission' },
    { key: 'facility_timezone', value: 'America/New_York', category: 'general', description: 'Facility timezone for display formatting' },
    { key: 'content_types', value: ['article', 'gallery', 'video', 'event'], category: 'statuses', description: 'Available content types' },
    { key: 'dispute_reasons', value: ['no_show', 'wrong_route', 'fare_dispute', 'service_complaint', 'other'], category: 'statuses', description: 'Available dispute reason values' },
    { key: 'min_ride_advance_minutes', value: 5, category: 'thresholds', description: 'Minimum minutes in advance for ride request time window start' },
    { key: 'max_ride_payment_amount', value: 500, category: 'thresholds', description: 'Maximum total payment amount per ride' },
  ];

  for (const c of configs) {
    await ConfigDictionary.findOneAndUpdate(
      { key: c.key },
      c,
      { upsert: true, new: true }
    );
  }

  console.log('Seed completed');
  if (!skipConnect) {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  seed().catch(err => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
}

module.exports = { seed };
