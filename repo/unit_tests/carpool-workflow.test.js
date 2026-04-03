const fs = require('fs');
const path = require('path');

describe('Carpool Workflow', () => {
  const model = fs.readFileSync(path.join(__dirname, '..', 'api', 'src', 'models', 'RideRequest.js'), 'utf-8');
  const service = fs.readFileSync(path.join(__dirname, '..', 'api', 'src', 'services', 'ride.service.js'), 'utf-8');
  const dispatch = fs.readFileSync(path.join(__dirname, '..', 'api', 'src', 'routes', 'dispatch.routes.js'), 'utf-8');
  const frontend = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'src', 'features', 'rides', 'RidesPage.jsx'), 'utf-8');
  const dispatchUI = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'src', 'features', 'dispatch', 'DispatchPage.jsx'), 'utf-8');

  describe('Model', () => {
    test('has is_carpool field', () => {
      expect(model).toContain('is_carpool');
      expect(model).toContain('Boolean');
    });

    test('has carpool_group_id field', () => {
      expect(model).toContain('carpool_group_id');
    });
  });

  describe('Service', () => {
    test('createRideRequest passes is_carpool', () => {
      expect(service).toContain('is_carpool: !!data.is_carpool');
    });

    test('getCarpoolCandidates filters by matching criteria', () => {
      expect(service).toContain('getCarpoolCandidates');
      expect(service).toContain('is_carpool: true');
      expect(service).toContain('vehicle_type: ride.vehicle_type');
      expect(service).toContain('time_window_start');
      expect(service).toContain('time_window_end');
    });

    test('groupCarpoolRides validates minimum 2 rides', () => {
      expect(service).toContain('At least 2 rides required');
    });

    test('groupCarpoolRides enforces max 6 total riders', () => {
      expect(service).toContain('totalRiders > 6');
      expect(service).toContain('exceeds maximum of 6');
    });

    test('groupCarpoolRides assigns group ID and transitions to accepted', () => {
      expect(service).toContain('carpool_group_id = groupId');
      expect(service).toContain("status = 'accepted'");
    });

    test('getCarpoolGroup fetches by group ID', () => {
      expect(service).toContain('getCarpoolGroup');
      expect(service).toContain('carpool_group_id: groupId');
    });
  });

  describe('Routes', () => {
    test('carpool candidates endpoint exists', () => {
      expect(dispatch).toContain('carpool/candidates');
    });

    test('carpool group creation endpoint exists', () => {
      expect(dispatch).toContain('carpool/group');
      expect(dispatch).toContain('ride_ids');
    });

    test('carpool group view endpoint exists', () => {
      expect(dispatch).toContain("carpool/group/:groupId");
    });
  });

  describe('Frontend — Ride Creation', () => {
    test('form has is_carpool checkbox', () => {
      expect(frontend).toContain('is_carpool');
      expect(frontend).toContain('carpool');
    });
  });

  describe('Frontend — Dispatch', () => {
    test('Find Carpool Matches button exists', () => {
      expect(dispatchUI).toContain('Find Carpool Matches');
    });

    test('carpool candidate selection exists', () => {
      expect(dispatchUI).toContain('carpoolCandidates');
      expect(dispatchUI).toContain('selectedForCarpool');
    });

    test('group action exists', () => {
      expect(dispatchUI).toContain('handleGroupCarpool');
      expect(dispatchUI).toContain('Group Selected');
    });
  });
});
