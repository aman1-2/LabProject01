import staffProvisioningService from '../services/staffProvisioningService.js';
import {
  getAdminOverview,
  rollupDailyStats,
} from '../services/statsRollupService.js';
import {
  listAllBookings,
  listAllLabs,
  verifyLab as verifyLabService,
  listAllRiders,
  listAllDoctors,
  verifyDoctor as verifyDoctorService,
} from '../services/adminService.js';
import { listAllFeedback } from '../services/feedbackService.js';

export async function getOverview(req, res, next) {
  try {
    const data = await getAdminOverview();
    return res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function triggerRollup(req, res, next) {
  try {
    const targetDate = req.body?.date ? new Date(req.body.date) : new Date();
    const data = await rollupDailyStats(targetDate);
    return res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getBookings(req, res, next) {
  try {
    const { status, limit, skip } = req.query;
    const data = await listAllBookings({ status, limit: Number(limit) || 50, skip: Number(skip) || 0 });
    return res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getLabs(req, res, next) {
  try {
    const data = await listAllLabs();
    return res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function verifyLab(req, res, next) {
  try {
    const isVerified = req.body?.isVerified !== undefined ? Boolean(req.body.isVerified) : true;
    const data = await verifyLabService(req.params.id, isVerified);
    return res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getRiders(req, res, next) {
  try {
    const data = await listAllRiders();
    return res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getDoctors(req, res, next) {
  try {
    const data = await listAllDoctors();
    return res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function verifyDoctor(req, res, next) {
  try {
    const isVerified = req.body?.isVerified !== undefined ? Boolean(req.body.isVerified) : true;
    const data = await verifyDoctorService(req.params.id, isVerified);
    return res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getFeedback(req, res, next) {
  try {
    const { limit, skip } = req.query;
    const data = await listAllFeedback({ limit: Number(limit) || 50, skip: Number(skip) || 0 });
    return res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

/**
 * Creating staff, from the admin console.
 *
 * Every one of these returns the generated password EXACTLY ONCE, in the
 * create response. It is never stored in plaintext and there is no endpoint
 * that will tell you it again — if the admin loses it before passing it on,
 * the account has to be recreated. That is the intended trade: a password
 * retrievable later is a password sitting in a database waiting to leak.
 *
 * `createdBy` is taken from the token, never the body. A caller nominating who
 * created an account could forge the audit trail, which is the one thing it
 * exists to prevent.
 */
export async function createLabCentre(req, res, next) {
  try {
    const lab = await staffProvisioningService.createLabCentre(req.body);
    res.status(201).json({ success: true, data: { lab } });
  } catch (error) {
    next(error);
  }
}

export async function createDoctorAccount(req, res, next) {
  try {
    const { user, doctor, password } = await staffProvisioningService.createDoctorAccount({
      ...req.body,
      createdBy: req.user.userId,
    });

    res.status(201).json({
      success: true,
      data: {
        doctor,
        credentials: {
          accountHandle: user.accountHandle,
          password,
          mustChangePassword: true,
          notice: 'Shown once. Pass it to the doctor — they must set their own on first sign-in.',
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function createRiderAccount(req, res, next) {
  try {
    const { user, rider, lab, password } = await staffProvisioningService.createRiderAccount({
      ...req.body,
      createdBy: req.user.userId,
    });

    res.status(201).json({
      success: true,
      data: {
        rider,
        labCentre: { id: lab._id.toString(), name: lab.name },
        credentials: {
          accountHandle: user.accountHandle,
          password,
          mustChangePassword: true,
          notice: 'Shown once. Pass it to the phlebotomist — they must set their own on first sign-in.',
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function createLabAdminAccount(req, res, next) {
  try {
    const { user, lab, password } = await staffProvisioningService.createLabAdminAccount({
      ...req.body,
      createdBy: req.user.userId,
    });

    res.status(201).json({
      success: true,
      data: {
        labAdmin: { id: user._id.toString(), name: user.name, accountHandle: user.accountHandle },
        labCentre: { id: lab._id.toString(), name: lab.name },
        credentials: {
          accountHandle: user.accountHandle,
          password,
          mustChangePassword: true,
          notice: 'Shown once. Pass it to the lab desk — they must set their own on first sign-in.',
        },
      },
    });
  } catch (error) {
    next(error);
  }
}
