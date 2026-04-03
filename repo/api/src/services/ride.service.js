const RideRequest = require('../models/RideRequest');
const { validateRideTransition } = require('../utils/state-machine');
const { getConfig } = require('./config.service');
const { NotFoundError, ValidationError, ForbiddenError } = require('../utils/errors');

async function createRideRequest(data, userId) {
  const start = new Date(data.time_window_start);
  const end = new Date(data.time_window_end);

  // Validate time window span <= 4 hours
  const spanHours = (end - start) / (1000 * 60 * 60);
  if (spanHours > 4) {
    throw new ValidationError('Time window cannot exceed 4 hours');
  }
  if (spanHours <= 0) {
    throw new ValidationError('End time must be after start time');
  }

  // Validate start is in the future
  const minAdvance = await getConfig('min_ride_advance_minutes', 5);
  const minStart = new Date(Date.now() + minAdvance * 60000);
  if (start < minStart) {
    throw new ValidationError(`Time window must start at least ${minAdvance} minutes from now`);
  }

  const autoCancelMinutes = await getConfig('auto_cancel_minutes', 30);
  const autoCancelAt = new Date(Date.now() + autoCancelMinutes * 60000);

  const ride = await RideRequest.create({
    requester: userId,
    pickup_text: data.pickup_text,
    dropoff_text: data.dropoff_text,
    rider_count: data.rider_count,
    time_window_start: start,
    time_window_end: end,
    vehicle_type: data.vehicle_type || 'sedan',
    is_carpool: !!data.is_carpool,
    status: 'pending_match',
    auto_cancel_at: autoCancelAt,
    state_transitions: [{
      from: 'created',
      to: 'pending_match',
      timestamp: new Date(),
      actor: userId,
      reason: data.is_carpool ? 'Carpool request submitted' : 'Ride request submitted'
    }]
  });

  return ride;
}

async function getRideRequests(filters = {}, page = 1, limit = 20) {
  const query = { deleted_at: null };
  if (filters.status) query.status = filters.status;
  if (filters.requester) query.requester = filters.requester;

  const total = await RideRequest.countDocuments(query);
  const rides = await RideRequest.find(query)
    .populate('requester', 'username display_name')
    .populate('assigned_dispatcher', 'username display_name')
    .sort({ created_at: -1 })
    .skip((page - 1) * limit)
    .limit(limit);

  return { rides, total, page, pages: Math.ceil(total / limit) };
}

async function getRideById(id) {
  const ride = await RideRequest.findOne({ _id: id, deleted_at: null })
    .populate('requester', 'username display_name')
    .populate('assigned_dispatcher', 'username display_name');
  if (!ride) throw new NotFoundError('Ride request');
  return ride;
}

async function transitionRide(id, toStatus, actorId, reason = null) {
  const ride = await RideRequest.findOne({ _id: id, deleted_at: null });
  if (!ride) throw new NotFoundError('Ride request');

  if (!validateRideTransition(ride.status, toStatus)) {
    throw new ValidationError(`Cannot transition from '${ride.status}' to '${toStatus}'`);
  }

  const fromStatus = ride.status;
  ride.status = toStatus;
  ride.state_transitions.push({
    from: fromStatus,
    to: toStatus,
    timestamp: new Date(),
    actor: actorId,
    reason: reason || `Status changed to ${toStatus}`
  });

  await ride.save();
  return ride;
}

async function acceptRide(id, dispatcherId, notes = null) {
  const ride = await transitionRide(id, 'accepted', dispatcherId, 'Accepted by dispatcher');
  ride.assigned_dispatcher = dispatcherId;
  if (notes) ride.dispatcher_notes = notes;
  ride.auto_cancel_at = null; // Clear auto-cancel
  await ride.save();
  return ride;
}

async function cancelRide(id, userId, userRole) {
  const ride = await RideRequest.findOne({ _id: id, deleted_at: null });
  if (!ride) throw new NotFoundError('Ride request');

  // Check if free cancellation window
  const freeCancelMinutes = await getConfig('free_cancel_window_minutes', 5);
  const freeCancelDeadline = new Date(ride.created_at.getTime() + freeCancelMinutes * 60000);
  const now = new Date();

  if (now <= freeCancelDeadline || ['administrator', 'dispatcher'].includes(userRole)) {
    // Free cancellation or dispatcher/admin override
    return transitionRide(id, 'canceled', userId, 'Canceled' + (now > freeCancelDeadline ? ' (dispatcher approved)' : ' (within free window)'));
  }

  // After free window — requires dispatcher approval
  ride.cancellation_requested = true;
  await ride.save();
  return { ride, requiresApproval: true, message: 'Cancellation requires dispatcher approval' };
}

async function approveCancellation(id, dispatcherId) {
  const ride = await RideRequest.findOne({ _id: id, deleted_at: null });
  if (!ride) throw new NotFoundError('Ride request');

  if (!ride.cancellation_requested) {
    throw new ValidationError('No cancellation request pending for this ride');
  }

  ride.cancellation_approved_by = dispatcherId;
  ride.cancellation_requested = false;

  return transitionRide(id, 'canceled', dispatcherId, 'Cancellation approved by dispatcher');
}

async function submitFeedback(id, userId, rating, comment) {
  const ride = await RideRequest.findOne({ _id: id, deleted_at: null });
  if (!ride) throw new NotFoundError('Ride request');

  if (ride.requester.toString() !== userId.toString()) {
    throw new ForbiddenError('Only the requester can submit feedback');
  }

  if (ride.status !== 'completed') {
    throw new ValidationError('Can only submit feedback for completed rides');
  }

  ride.feedback = { rating, comment };
  await ride.save();
  return ride;
}

async function autoCancelExpiredRequests() {
  const now = new Date();
  const expired = await RideRequest.find({
    status: 'pending_match',
    auto_cancel_at: { $lte: now },
    deleted_at: null
  });

  let count = 0;
  for (const ride of expired) {
    ride.status = 'canceled';
    ride.state_transitions.push({
      from: 'pending_match',
      to: 'canceled',
      timestamp: now,
      actor: null,
      reason: 'Auto-canceled: no match within time limit'
    });
    await ride.save();
    count++;
  }
  return count;
}

async function getCarpoolCandidates(rideId) {
  const ride = await RideRequest.findOne({ _id: rideId, deleted_at: null });
  if (!ride) throw new NotFoundError('Ride request');
  if (!ride.is_carpool) throw new ValidationError('This ride is not marked as carpool');

  const candidates = await RideRequest.find({
    _id: { $ne: ride._id },
    is_carpool: true,
    status: 'pending_match',
    deleted_at: null,
    carpool_group_id: null,
    vehicle_type: ride.vehicle_type,
    time_window_start: { $lte: ride.time_window_end },
    time_window_end: { $gte: ride.time_window_start },
  }).populate('requester', 'username display_name').limit(20);

  return candidates;
}

async function groupCarpoolRides(rideIds, dispatcherId) {
  if (!rideIds || rideIds.length < 2) {
    throw new ValidationError('At least 2 rides required for a carpool group');
  }

  const rides = await RideRequest.find({
    _id: { $in: rideIds },
    is_carpool: true,
    status: 'pending_match',
    deleted_at: null
  });

  if (rides.length !== rideIds.length) {
    throw new ValidationError('Some rides are not eligible for carpool grouping');
  }

  const totalRiders = rides.reduce((sum, r) => sum + r.rider_count, 0);
  if (totalRiders > 6) {
    throw new ValidationError(`Combined rider count (${totalRiders}) exceeds maximum of 6`);
  }

  const crypto = require('crypto');
  const groupId = `carpool_${crypto.randomBytes(6).toString('hex')}`;

  for (const ride of rides) {
    ride.carpool_group_id = groupId;
    ride.assigned_dispatcher = dispatcherId;
    ride.status = 'accepted';
    ride.auto_cancel_at = null;
    ride.state_transitions.push({
      from: 'pending_match',
      to: 'accepted',
      timestamp: new Date(),
      actor: dispatcherId,
      reason: `Grouped into carpool ${groupId}`
    });
    await ride.save();
  }

  return { group_id: groupId, rides, total_riders: totalRiders };
}

async function getCarpoolGroup(groupId) {
  return RideRequest.find({ carpool_group_id: groupId, deleted_at: null })
    .populate('requester', 'username display_name');
}

module.exports = {
  createRideRequest,
  getRideRequests,
  getRideById,
  transitionRide,
  acceptRide,
  cancelRide,
  approveCancellation,
  submitFeedback,
  autoCancelExpiredRequests,
  getCarpoolCandidates,
  groupCarpoolRides,
  getCarpoolGroup
};
