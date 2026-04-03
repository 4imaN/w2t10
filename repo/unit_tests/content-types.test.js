const fs = require('fs');
const path = require('path');

describe('Content Type-Specific Support', () => {
  const modelFile = fs.readFileSync(path.join(__dirname, '..', 'api', 'src', 'models', 'ContentItem.js'), 'utf-8');
  const serviceFile = fs.readFileSync(path.join(__dirname, '..', 'api', 'src', 'services', 'content.service.js'), 'utf-8');
  const frontendFile = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'src', 'features', 'content', 'ContentPage.jsx'), 'utf-8');

  describe('Gallery', () => {
    test('model has gallery_items field', () => {
      expect(modelFile).toContain('gallery_items');
      expect(modelFile).toContain('media_url');
      expect(modelFile).toContain('caption');
      expect(modelFile).toContain('sort_order');
    });
    test('frontend has gallery form fields', () => {
      expect(frontendFile).toContain('gallery_items');
      expect(frontendFile).toContain('Gallery Items');
      expect(frontendFile).toContain('Add Item');
    });
  });

  describe('Video', () => {
    test('model has video fields', () => {
      expect(modelFile).toContain('video_url');
      expect(modelFile).toContain('video_duration_seconds');
      expect(modelFile).toContain('video_format');
    });
    test('service validates video requires url or body', () => {
      expect(serviceFile).toContain('video_url');
      expect(serviceFile).toContain("Video content requires");
    });
    test('frontend has video form fields', () => {
      expect(frontendFile).toContain('video_url');
      expect(frontendFile).toContain('Video URL');
      expect(frontendFile).toContain('Duration');
    });
  });

  describe('Event', () => {
    test('model has event fields', () => {
      expect(modelFile).toContain('event_date');
      expect(modelFile).toContain('event_end_date');
      expect(modelFile).toContain('event_location');
      expect(modelFile).toContain('event_capacity');
    });
    test('service validates event requires date', () => {
      expect(serviceFile).toContain("Event content requires an event_date");
    });
    test('service validates end date after start', () => {
      expect(serviceFile).toContain("event_end_date must be after event_date");
    });
    test('frontend has event form fields', () => {
      expect(frontendFile).toContain('event_date');
      expect(frontendFile).toContain('Event Date');
      expect(frontendFile).toContain('Location');
      expect(frontendFile).toContain('Capacity');
    });
  });

  describe('Validation flow', () => {
    test('validateTypeFields function exists', () => {
      expect(serviceFile).toContain('function validateTypeFields');
    });
    test('extractTypeFields function exists', () => {
      expect(serviceFile).toContain('function extractTypeFields');
    });
    test('createContent calls validation', () => {
      expect(serviceFile).toContain('validateTypeFields(data)');
    });
    test('updateContent calls validation', () => {
      expect(serviceFile).toContain('validateTypeFields(');
    });
    test('revision snapshot includes type fields', () => {
      const match = serviceFile.match(/snapshot:.*extractTypeFields/);
      expect(match).toBeTruthy();
    });
  });
});
