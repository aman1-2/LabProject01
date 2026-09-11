import DailyStats from '../schemas/DailyStats.js';
import Booking from '../schemas/Booking.js';
import User from '../schemas/User.js';
import LabCenter from '../schemas/LabCenter.js';

/**
 * Perform idempotent nightly rollup of daily business & operational metrics.
 * Re-running for a date calculates from source records and overwrites without double-counting.
 * @param {Date|string} [targetDate=new Date()]
 * @returns {Promise<Object>} Updated or created DailyStats document
 */
export async function rollupDailyStats(targetDate = new Date()) {
  const startOfDay = new Date(targetDate);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(targetDate);
  endOfDay.setHours(23, 59, 59, 999);

  // 1. Query all bookings created in the target date window
  const bookings = await Booking.find({
    createdAt: { $gte: startOfDay, $lte: endOfDay },
  }).populate('labCenterId');

  // 2. Query signups created in the target date window
  const newSignups = await User.countDocuments({
    createdAt: { $gte: startOfDay, $lte: endOfDay },
  });

  // 3. Compute metrics
  const bookingsCount = bookings.length;
  let revenue = 0;
  let revenuePending = 0;
  let reportsDelivered = 0;
  let homeCount = 0;
  let visitCount = 0;
  let upiCount = 0;
  let cashCount = 0;
  const labVolumeMap = new Map();

  for (const b of bookings) {
    if (b.paymentStatus === 'paid') {
      revenue += b.amount || 0;
    } else {
      revenuePending += b.amount || 0;
    }

    if (b.status === 'report_ready') {
      reportsDelivered += 1;
    }

    if (b.mode === 'home') homeCount += 1;
    else if (b.mode === 'visit') visitCount += 1;

    if (b.paymentMode === 'cash') cashCount += 1;
    else upiCount += 1;

    if (b.labCenterId) {
      const labIdStr = b.labCenterId._id ? b.labCenterId._id.toString() : b.labCenterId.toString();
      const labName = b.labCenterId.name || 'Lab Centre';
      if (!labVolumeMap.has(labIdStr)) {
        labVolumeMap.set(labIdStr, {
          labCenterId: b.labCenterId._id || b.labCenterId,
          labName,
          count: 0,
        });
      }
      labVolumeMap.get(labIdStr).count += 1;
    }
  }

  const perLabVolumes = Array.from(labVolumeMap.values());

  // 4. Idempotent upsert by date
  const stat = await DailyStats.findOneAndUpdate(
    { date: startOfDay },
    {
      $set: {
        date: startOfDay,
        bookingsCount,
        revenue,
        revenuePending,
        reportsDelivered,
        newSignups,
        modeSplit: { home: homeCount, visit: visitCount },
        paymentSplit: { upi: upiCount, cash: cashCount },
        perLabVolumes,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return stat;
}

/**
 * Get Business Overview metrics: today computed live; historical from DailyStats
 * @returns {Promise<{ today: Object, historical: Array<Object> }>}
 */
export async function getAdminOverview() {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  // 1. Live today bookings
  const todayBookings = await Booking.find({
    createdAt: { $gte: todayStart },
  }).populate('labCenterId');

  // 2. Live today user signups
  const todaySignups = await User.countDocuments({
    createdAt: { $gte: todayStart },
  });

  // 3. Compute live figures
  let revenue = 0;
  let revenuePending = 0;
  let reportsDelivered = 0;
  let homeCount = 0;
  let visitCount = 0;
  let upiCount = 0;
  let cashCount = 0;

  // Initialize with all active lab centres so zero-volume labs appear
  const allLabs = await LabCenter.find({ isActive: true });
  const labVolumeMap = new Map();
  for (const lab of allLabs) {
    labVolumeMap.set(lab._id.toString(), {
      labId: lab._id,
      labName: lab.name,
      count: 0,
    });
  }

  for (const b of todayBookings) {
    if (b.paymentStatus === 'paid') {
      revenue += b.amount || 0;
    } else {
      revenuePending += b.amount || 0;
    }

    if (b.status === 'report_ready') {
      reportsDelivered += 1;
    }

    if (b.mode === 'home') homeCount += 1;
    else if (b.mode === 'visit') visitCount += 1;

    if (b.paymentMode === 'cash') cashCount += 1;
    else upiCount += 1;

    if (b.labCenterId) {
      const labIdStr = b.labCenterId._id ? b.labCenterId._id.toString() : b.labCenterId.toString();
      const labName = b.labCenterId.name || 'Lab Centre';
      if (labVolumeMap.has(labIdStr)) {
        labVolumeMap.get(labIdStr).count += 1;
      } else {
        labVolumeMap.set(labIdStr, {
          labId: b.labCenterId._id || b.labCenterId,
          labName,
          count: 1,
        });
      }
    }
  }

  const perLabVolumes = Array.from(labVolumeMap.values());

  const today = {
    bookingsCount: todayBookings.length,
    revenue,
    revenuePending,
    reportsDelivered,
    newSignups: todaySignups,
    modeSplit: { home: homeCount, visit: visitCount },
    paymentSplit: { upi: upiCount, cash: cashCount },
    perLabVolumes,
  };

  // 4. Historical stats from DailyStats (days before today)
  const historical = await DailyStats.find({
    date: { $lt: todayStart },
  })
    .sort({ date: -1 })
    .limit(30);

  return {
    today,
    historical,
  };
}
