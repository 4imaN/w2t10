const Dispute = require('../models/Dispute');
const RideRequest = require('../models/RideRequest');
const { encrypt, decrypt } = require('../utils/crypto');
const { getConfig } = require('./config.service');
const { transitionRide } = require('./ride.service');
const { NotFoundError, ValidationError, ForbiddenError } = require('../utils/errors');

const PRIVILEGED_ROLES = ['administrator', 'dispatcher'];

async function createDispute(data, userId, userRole) {
  const ride = await RideRequest.findOne({ _id: data.ride_request, deleted_at: null });
  if (!ride) throw new NotFoundError('Ride request');


  if (!PRIVILEGED_ROLES.includes(userRole)) {
    if (ride.requester.toString() !== userId.toString()) {
      throw new ForbiddenError('You can only dispute your own ride requests');
    }
  }

  if (!['accepted', 'in_progress', 'completed'].includes(ride.status)) {
    throw new ValidationError('Can only dispute rides that are accepted, in progress, or completed');
  }


  await transitionRide(ride._id, 'in_dispute', userId, `Dispute initiated: ${data.reason}`);

  const escalationHours = await getConfig('dispute_escalation_hours', 24);
  const escalationDeadline = new Date(Date.now() + escalationHours * 3600000);

  const dispute = await Dispute.create({
    ride_request: data.ride_request,
    initiated_by: userId,
    reason: data.reason,
    detail_encrypted: data.detail ? encrypt(data.detail) : null,
    status: 'open',
    escalation_deadline: escalationDeadline
  });

  return dispute;
}

async function getDisputes(filters = {}, page = 1, limit = 20) {
  const query = { deleted_at: null };
  if (filters.status) query.status = filters.status;
  if (filters.assigned_dispatcher) query.assigned_dispatcher = filters.assigned_dispatcher;

  const total = await Dispute.countDocuments(query);
  const disputes = await Dispute.find(query)
    .populate('ride_request', 'pickup_text dropoff_text status')
    .populate('initiated_by', 'username display_name')
    .populate('assigned_dispatcher', 'username display_name')
    .sort({ created_at: -1 })
    .skip((page - 1) * limit)
    .limit(limit);


  const decryptedDisputes = disputes.map(d => {
    const obj = d.toObject();
    if (obj.detail_encrypted) {
      obj.detail = decrypt(obj.detail_encrypted);
    }
    return obj;
  });

  return { disputes: decryptedDisputes, total, page, pages: Math.ceil(total / limit) };
}

async function getDisputeById(id) {
  const dispute = await Dispute.findOne({ _id: id, deleted_at: null })
    .populate('ride_request')
    .populate('initiated_by', 'username display_name')
    .populate('assigned_dispatcher', 'username display_name');
  if (!dispute) throw new NotFoundError('Dispute');


  if (dispute.detail_encrypted) {
    dispute._doc.detail = decrypt(dispute.detail_encrypted);
  }
  if (dispute.resolution_notes_encrypted) {
    dispute._doc.resolution_notes = decrypt(dispute.resolution_notes_encrypted);
  }

  return dispute;
}

async function assignDispute(disputeId, dispatcherId, userRole) {
  const dispute = await Dispute.findOne({ _id: disputeId, deleted_at: null });
  if (!dispute) throw new NotFoundError('Dispute');


  if (dispute.assigned_dispatcher &&
      dispute.assigned_dispatcher.toString() !== dispatcherId.toString() &&
      userRole !== 'administrator') {
    throw new ForbiddenError('Only the assigned dispatcher or an admin can modify this dispute');
  }

  dispute.assigned_dispatcher = dispatcherId;
  dispute.status = 'investigating';
  await dispute.save();
  return dispute;
}

function enforceDisputeAccess(dispute, userId, userRole) {
  if (userRole === 'administrator') return;
  if (!dispute.assigned_dispatcher) {
    throw new ForbiddenError('Dispute must be assigned before it can be resolved');
  }
  if (dispute.assigned_dispatcher.toString() !== userId.toString()) {
    throw new ForbiddenError('Only the assigned dispatcher or an admin can modify this dispute');
  }
}

async function resolveDispute(disputeId, dispatcherId, resolution, notes, userRole) {
  const dispute = await Dispute.findOne({ _id: disputeId, deleted_at: null });
  if (!dispute) throw new NotFoundError('Dispute');

  enforceDisputeAccess(dispute, dispatcherId, userRole);

  dispute.resolution = resolution;
  dispute.resolution_notes_encrypted = notes ? encrypt(notes) : null;
  dispute.status = resolution === 'escalated' ? 'escalated' : 'resolved';
  dispute.assigned_dispatcher = dispatcherId;
  await dispute.save();


  if (dispute.status === 'resolved') {
    const ride = await RideRequest.findById(dispute.ride_request);
    if (ride && ride.status === 'in_dispute') {
      if (['resolved_in_favor_of_rider', 'partial_refund'].includes(resolution)) {
        await transitionRide(ride._id, 'canceled', dispatcherId, `Dispute resolved: ${resolution}`);
      } else {
        await transitionRide(ride._id, 'completed', dispatcherId, `Dispute resolved: ${resolution}`);
      }
    }
  }

  return dispute;
}

module.exports = {
  createDispute,
  getDisputes,
  getDisputeById,
  assignDispute,
  resolveDispute
};
