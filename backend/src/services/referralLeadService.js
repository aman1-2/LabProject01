import mongoose from 'mongoose';
import { ExternalReferralMention } from '../schemas/ExternalReferralMention.js';
import { AppError } from '../utils/AppError.js';

export async function listReferralLeads({
  status = 'all',
  search = '',
  page = 1,
  limit = 50,
} = {}) {
  const query = {};

  if (status && status !== 'all') {
    query.status = status;
  }

  if (search && search.trim()) {
    const q = search.trim();
    query.$or = [
      { rawName: new RegExp(q, 'i') },
      { normalizedName: new RegExp(q, 'i') },
      { notes: new RegExp(q, 'i') },
    ];
  }

  const skip = (Number(page) - 1) * Number(limit);

  const [leads, total] = await Promise.all([
    ExternalReferralMention.find(query)
      .sort({ mentionCount: -1, lastMentionedAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    ExternalReferralMention.countDocuments(query),
  ]);

  return {
    leads,
    total,
    page: Number(page),
    limit: Number(limit),
    totalPages: Math.ceil(total / Number(limit)) || 1,
  };
}

export async function updateReferralLead(id, { status, notes }) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError('Invalid lead ID', 400, 'INVALID_LEAD_ID');
  }

  const lead = await ExternalReferralMention.findById(id);
  if (!lead) {
    throw new AppError('Referral lead not found', 404, 'LEAD_NOT_FOUND');
  }

  if (status !== undefined) {
    const validStatuses = ['New', 'Contacted', 'In discussion', 'Converted', 'Declined'];
    if (!validStatuses.includes(status)) {
      throw new AppError(
        `Invalid status '${status}'. Must be one of: ${validStatuses.join(', ')}`,
        400,
        'INVALID_STATUS'
      );
    }
    lead.status = status;
  }

  if (notes !== undefined) {
    lead.notes = String(notes).trim();
  }

  await lead.save();
  return lead;
}

export default {
  listReferralLeads,
  updateReferralLead,
};
