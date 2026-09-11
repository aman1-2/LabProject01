import referralLeadService from '../services/referralLeadService.js';
import {
  updateReferralLeadSchema,
  referralLeadQuerySchema,
} from '@pathcare/validators';

export async function getReferralLeads(req, res, next) {
  try {
    const validatedQuery = referralLeadQuerySchema.parse(req.query);
    const result = await referralLeadService.listReferralLeads(validatedQuery);
    res.status(200).json({
      success: true,
      data: result.leads,
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function updateReferralLead(req, res, next) {
  try {
    const validatedBody = updateReferralLeadSchema.parse(req.body);
    const updated = await referralLeadService.updateReferralLead(
      req.params.id,
      validatedBody
    );
    res.status(200).json({
      success: true,
      message: 'Referral lead updated successfully',
      data: updated,
    });
  } catch (error) {
    next(error);
  }
}

export default {
  getReferralLeads,
  updateReferralLead,
};
