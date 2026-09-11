import subscriptionService from '../services/subscriptionService.js';

/**
 * Controllers parse the request, call ONE service, and shape the response.
 * No business rules here (CONTEXT §4.4).
 */

export async function createSubscription(req, res, next) {
  try {
    const patientId = req.user.userId || req.user.id;
    const subscription = await subscriptionService.createSubscription({
      patientId,
      packageId: req.body.packageId,
      labCenterId: req.body.labCenterId,
      frequencyDays: req.body.frequencyDays,
      addressId: req.body.addressId,
      mode: req.body.mode,
    });

    return res.status(201).json({
      success: true,
      data: {
        subscription,
        // Where the patient approves the UPI AutoPay mandate. Nothing is
        // charged until they do.
        authorizationUrl: subscription.authorizationUrl,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function listSubscriptions(req, res, next) {
  try {
    const patientId = req.user.userId || req.user.id;
    const items = await subscriptionService.listForPatient(patientId);
    return res.status(200).json({ success: true, data: { items } });
  } catch (error) {
    next(error);
  }
}

export async function getSubscription(req, res, next) {
  try {
    const patientId = req.user.userId || req.user.id;
    const subscription = await subscriptionService.getForPatient({
      subscriptionId: req.params.id,
      patientId,
    });
    return res.status(200).json({ success: true, data: subscription });
  } catch (error) {
    next(error);
  }
}

export async function pauseSubscription(req, res, next) {
  try {
    const patientId = req.user.userId || req.user.id;
    const subscription = await subscriptionService.pauseSubscription({
      subscriptionId: req.params.id,
      patientId,
    });
    return res.status(200).json({ success: true, data: subscription });
  } catch (error) {
    next(error);
  }
}

export async function resumeSubscription(req, res, next) {
  try {
    const patientId = req.user.userId || req.user.id;
    const subscription = await subscriptionService.resumeSubscription({
      subscriptionId: req.params.id,
      patientId,
    });
    return res.status(200).json({ success: true, data: subscription });
  } catch (error) {
    next(error);
  }
}

export async function cancelSubscription(req, res, next) {
  try {
    const patientId = req.user.userId || req.user.id;
    const subscription = await subscriptionService.cancelSubscription({
      subscriptionId: req.params.id,
      patientId,
      reason: req.body?.reason ?? null,
    });
    return res.status(200).json({ success: true, data: subscription });
  } catch (error) {
    next(error);
  }
}

export default {
  createSubscription,
  listSubscriptions,
  getSubscription,
  pauseSubscription,
  resumeSubscription,
  cancelSubscription,
};
