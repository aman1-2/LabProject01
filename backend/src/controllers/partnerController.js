import doctorService from '../services/doctorService.js';
import { partnerApplicationSchema } from '@pathcare/validators';

export async function submitApplication(req, res, next) {
  try {
    const validatedData = partnerApplicationSchema.parse(req.body);
    const application = await doctorService.submitPartnerApplication(validatedData);
    res.status(201).json({
      success: true,
      message: 'Application received. Our partnerships team will call you within two working days.',
      data: application,
    });
  } catch (error) {
    next(error);
  }
}

export default {
  submitApplication,
};
