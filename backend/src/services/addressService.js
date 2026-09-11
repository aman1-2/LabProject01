import mongoose from 'mongoose';
import addressRepository from '../repositories/addressRepository.js';
import { supportsTransactions } from '../utils/transactionHelper.js';
import { AppError } from '../utils/AppError.js';

export async function createAddress(ownerId, addressData) {
  const isReplicaSet = await supportsTransactions();

  if (isReplicaSet) {
    const session = await mongoose.startSession();
    try {
      let createdAddress;
      await session.withTransaction(async () => {
        const count = await addressRepository.countByOwnerId(ownerId, session);
        const shouldBeDefault = count === 0 || Boolean(addressData.isDefault);

        if (shouldBeDefault && count > 0) {
          await addressRepository.unsetOtherDefaults(ownerId, null, session);
        }

        createdAddress = await addressRepository.create(
          {
            ...addressData,
            ownerId,
            isDefault: shouldBeDefault,
          },
          session
        );
      });
      return createdAddress;
    } finally {
      await session.endSession();
    }
  } else {
    const count = await addressRepository.countByOwnerId(ownerId);
    const shouldBeDefault = count === 0 || Boolean(addressData.isDefault);

    if (shouldBeDefault && count > 0) {
      await addressRepository.unsetOtherDefaults(ownerId);
    }

    return addressRepository.create({
      ...addressData,
      ownerId,
      isDefault: shouldBeDefault,
    });
  }
}

export async function getAddresses(ownerId) {
  return addressRepository.findByOwnerId(ownerId);
}

export async function getAddressById(id, ownerId) {
  const address = await addressRepository.findByIdAndOwner(id, ownerId);
  if (!address) {
    throw new AppError('Address not found', 404, 'ADDRESS_NOT_FOUND');
  }
  return address;
}

export async function updateAddress(id, ownerId, updateData) {
  const isReplicaSet = await supportsTransactions();

  if (isReplicaSet) {
    const session = await mongoose.startSession();
    try {
      let updated;
      await session.withTransaction(async () => {
        const existing = await addressRepository.findByIdAndOwner(id, ownerId, session);
        if (!existing) {
          throw new AppError('Address not found', 404, 'ADDRESS_NOT_FOUND');
        }

        if (updateData.isDefault === true) {
          await addressRepository.unsetOtherDefaults(ownerId, id, session);
        } else if (updateData.isDefault === false && existing.isDefault) {
          const otherLatest = await addressRepository.findLatestByOwnerId(ownerId, session);
          if (otherLatest && String(otherLatest._id) !== String(id)) {
            otherLatest.isDefault = true;
            await otherLatest.save({ session });
          } else {
            // Keep default if it is the only address
            updateData.isDefault = true;
          }
        }

        updated = await addressRepository.updateByIdAndOwner(id, ownerId, updateData, session);
      });
      return updated;
    } finally {
      await session.endSession();
    }
  } else {
    const existing = await addressRepository.findByIdAndOwner(id, ownerId);
    if (!existing) {
      throw new AppError('Address not found', 404, 'ADDRESS_NOT_FOUND');
    }

    if (updateData.isDefault === true) {
      await addressRepository.unsetOtherDefaults(ownerId, id);
    } else if (updateData.isDefault === false && existing.isDefault) {
      const other = await addressRepository.findByOwnerId(ownerId);
      const otherAddr = other.find((a) => String(a._id) !== String(id));
      if (otherAddr) {
        otherAddr.isDefault = true;
        await otherAddr.save();
      } else {
        updateData.isDefault = true;
      }
    }

    return addressRepository.updateByIdAndOwner(id, ownerId, updateData);
  }
}

export async function deleteAddress(id, ownerId) {
  const isReplicaSet = await supportsTransactions();

  if (isReplicaSet) {
    const session = await mongoose.startSession();
    try {
      let result;
      await session.withTransaction(async () => {
        const existing = await addressRepository.findByIdAndOwner(id, ownerId, session);
        if (!existing) {
          throw new AppError('Address not found', 404, 'ADDRESS_NOT_FOUND');
        }

        const wasDefault = existing.isDefault;
        result = await addressRepository.deleteByIdAndOwner(id, ownerId, session);

        if (wasDefault) {
          const remaining = await addressRepository.findLatestByOwnerId(ownerId, session);
          if (remaining) {
            remaining.isDefault = true;
            await remaining.save({ session });
          }
        }
      });
      return result;
    } finally {
      await session.endSession();
    }
  } else {
    const existing = await addressRepository.findByIdAndOwner(id, ownerId);
    if (!existing) {
      throw new AppError('Address not found', 404, 'ADDRESS_NOT_FOUND');
    }

    const wasDefault = existing.isDefault;
    const result = await addressRepository.deleteByIdAndOwner(id, ownerId);

    if (wasDefault) {
      const remaining = await addressRepository.findLatestByOwnerId(ownerId);
      if (remaining) {
        remaining.isDefault = true;
        await remaining.save();
      }
    }
    return result;
  }
}

export default {
  createAddress,
  getAddresses,
  getAddressById,
  updateAddress,
  deleteAddress,
};
