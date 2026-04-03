const Movie = require('../models/Movie');
const MovieImportJob = require('../models/MovieImportJob');
const { createSnapshot } = require('./movie.service');
const { NotFoundError } = require('../utils/errors');

/**
 * Parse a CSV line handling quoted fields (e.g., "field,with,commas").
 */
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function parseImportFile(content, filename) {
  const ext = filename.toLowerCase().split('.').pop();

  if (ext === 'json') {
    const data = JSON.parse(content);
    return Array.isArray(data) ? data : [data];
  }

  if (ext === 'csv') {
    const lines = content.split('\n').filter(l => l.trim());
    if (lines.length < 2) return [];
    const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase());
    return lines.slice(1).map(line => {
      const values = parseCSVLine(line);
      const obj = {};
      headers.forEach((h, i) => {
        obj[h] = values[i] || '';
      });
      return obj;
    });
  }

  throw new Error('Unsupported file format. Use JSON or CSV.');
}

/**
 * Extract a release year from a date value (string or Date).
 * Returns the 4-digit year as a number, or null.
 */
function extractYear(dateValue) {
  if (!dateValue) return null;
  const d = new Date(dateValue);
  if (isNaN(d.getTime())) {
    // Try extracting 4-digit year from string
    const match = String(dateValue).match(/(\d{4})/);
    return match ? parseInt(match[1]) : null;
  }
  return d.getFullYear();
}

async function createImportJob(fileContent, filename, userId) {
  const records = parseImportFile(fileContent, filename);

  const job = new MovieImportJob({
    filename,
    uploaded_by: userId,
    total_records: records.length,
    status: 'ready',
    records: []
  });

  for (const record of records) {
    // Match by title + release year (when available).
    // If release_date/release_year is provided, use title+year for precise matching.
    // If no year in import, fall back to title-only matching.
    let matchedMovie = null;
    if (record.title) {
      const titleRegex = new RegExp(`^${escapeRegex(record.title)}$`, 'i');
      const importYear = extractYear(record.release_date || record.release_year);

      if (importYear) {
        // Match by title + year range (same year)
        const yearStart = new Date(`${importYear}-01-01`);
        const yearEnd = new Date(`${importYear + 1}-01-01`);
        matchedMovie = await Movie.findOne({
          title: titleRegex,
          release_date: { $gte: yearStart, $lt: yearEnd },
          deleted_at: null
        });
      }

      // Fall back to title-only if no year match found
      if (!matchedMovie) {
        matchedMovie = await Movie.findOne({ title: titleRegex, deleted_at: null });
      }
    }

    if (matchedMovie) {
      const conflicts = [];

      // Scalar fields
      const scalarFields = ['title', 'description', 'mpaa_rating'];
      for (const field of scalarFields) {
        if (record[field] !== undefined && String(record[field]) !== String(matchedMovie[field] || '')) {
          conflicts.push({
            field,
            existing_value: matchedMovie[field],
            imported_value: record[field],
            resolution: null
          });
        }
      }

      // Release date comparison (as date strings)
      if (record.release_date !== undefined) {
        const importedDate = new Date(record.release_date);
        const existingDate = matchedMovie.release_date;
        const importedStr = isNaN(importedDate.getTime()) ? '' : importedDate.toISOString().split('T')[0];
        const existingStr = existingDate ? existingDate.toISOString().split('T')[0] : '';
        if (importedStr !== existingStr) {
          conflicts.push({
            field: 'release_date',
            existing_value: existingStr || null,
            imported_value: importedStr || record.release_date,
            resolution: null
          });
        }
      }

      // Array fields
      for (const field of ['categories', 'tags']) {
        if (record[field]) {
          const importedArr = Array.isArray(record[field]) ? record[field] : record[field].split(';').map(s => s.trim());
          const existingArr = matchedMovie[field] || [];
          if (JSON.stringify([...importedArr].sort()) !== JSON.stringify([...existingArr].sort())) {
            conflicts.push({
              field,
              existing_value: existingArr,
              imported_value: importedArr,
              resolution: null
            });
          }
        }
      }

      job.records.push({
        imported_data: record,
        matched_movie_id: matchedMovie._id,
        conflicts,
        status: conflicts.length > 0 ? 'conflict' : 'pending'
      });

      if (conflicts.length > 0) job.conflict_count++;
    } else {
      job.records.push({
        imported_data: record,
        matched_movie_id: null,
        conflicts: [],
        status: 'pending'
      });
    }
  }

  await job.save();
  return job;
}

async function getImportJob(jobId) {
  const job = await MovieImportJob.findById(jobId);
  if (!job) throw new NotFoundError('Import job');
  return job;
}

async function resolveConflict(jobId, recordIndex, resolutions, userId) {
  const job = await MovieImportJob.findById(jobId);
  if (!job) throw new NotFoundError('Import job');

  const record = job.records[recordIndex];
  if (!record) throw new NotFoundError('Import record');

  for (const conflict of record.conflicts) {
    if (resolutions[conflict.field]) {
      conflict.resolution = resolutions[conflict.field];
    }
  }

  const allResolved = record.conflicts.every(c => c.resolution !== null);
  if (allResolved) {
    record.status = 'resolved';
  }

  await job.save();
  return job;
}

async function skipRecord(jobId, recordIndex, userId) {
  const job = await MovieImportJob.findById(jobId);
  if (!job) throw new NotFoundError('Import job');

  const record = job.records[recordIndex];
  if (!record) throw new NotFoundError('Import record');

  record.status = 'skipped';
  await job.save();
  return job;
}

async function executeImport(jobId, userId) {
  const job = await MovieImportJob.findById(jobId);
  if (!job) throw new NotFoundError('Import job');

  const unresolvedConflicts = job.records.filter(r => r.status === 'conflict');
  if (unresolvedConflicts.length > 0) {
    const { ValidationError } = require('../utils/errors');
    throw new ValidationError(
      `Cannot execute: ${unresolvedConflicts.length} record(s) have unresolved conflicts. ` +
      `Resolve all conflicts or skip the records before executing.`
    );
  }

  job.status = 'in_progress';
  await job.save();

  let imported = 0;
  let skipped = 0;

  for (const record of job.records) {
    if (record.status === 'skipped') {
      skipped++;
      continue;
    }

    if (record.matched_movie_id && record.status === 'resolved') {
      const movie = await Movie.findById(record.matched_movie_id);
      if (!movie) {
        record.status = 'skipped';
        skipped++;
        continue;
      }

      for (const conflict of record.conflicts) {
        if (conflict.resolution === 'use_imported') {
          if (conflict.field === 'release_date') {
            movie.release_date = conflict.imported_value ? new Date(conflict.imported_value) : null;
          } else {
            movie[conflict.field] = conflict.imported_value;
          }
        }
      }

      movie.revisions.push(createSnapshot(movie, userId, 'import_merge'));
      await movie.save();
      record.status = 'imported';
      imported++;

    } else if (!record.matched_movie_id && record.status === 'pending') {
      const data = record.imported_data;
      const movie = new Movie({
        title: data.title,
        description: data.description || '',
        categories: Array.isArray(data.categories) ? data.categories : (data.categories || '').split(';').filter(Boolean),
        tags: Array.isArray(data.tags) ? data.tags : (data.tags || '').split(';').filter(Boolean),
        mpaa_rating: data.mpaa_rating || 'NR',
        release_date: data.release_date ? new Date(data.release_date) : null,
        is_published: true,
        created_by: userId,
        revisions: []
      });
      await movie.save();
      movie.revisions.push(createSnapshot(movie, userId, 'create'));
      await movie.save();

      record.matched_movie_id = movie._id;
      record.status = 'imported';
      imported++;

    } else if (record.status === 'conflict') {
      record.status = 'skipped';
      skipped++;
    }
  }

  job.imported_count = imported;
  job.skipped_count = skipped;
  job.status = 'completed';
  await job.save();

  return job;
}

function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
  parseImportFile,
  parseCSVLine,
  extractYear,
  createImportJob,
  getImportJob,
  resolveConflict,
  skipRecord,
  executeImport
};
