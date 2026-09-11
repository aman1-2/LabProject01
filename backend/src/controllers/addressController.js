import addressService from '../services/addressService.js';
import { createAddressSchema, updateAddressSchema } from '@pathcare/validators';

export async function listAddresses(req, res, next) {
  try {
    const ownerId = req.user.userId || req.user.id;
    const addresses = await addressService.getAddresses(ownerId);
    res.status(200).json({
      success: true,
      data: addresses,
    });
  } catch (error) {
    next(error);
  }
}

export async function createAddress(req, res, next) {
  try {
    const ownerId = req.user.userId || req.user.id;
    const validatedData = createAddressSchema.parse(req.body);
    const address = await addressService.createAddress(ownerId, validatedData);
    res.status(201).json({
      success: true,
      data: address,
    });
  } catch (error) {
    next(error);
  }
}

export async function getAddress(req, res, next) {
  try {
    const ownerId = req.user.userId || req.user.id;
    const address = await addressService.getAddressById(req.params.id, ownerId);
    res.status(200).json({
      success: true,
      data: address,
    });
  } catch (error) {
    next(error);
  }
}

export async function updateAddress(req, res, next) {
  try {
    const ownerId = req.user.userId || req.user.id;
    const validatedData = updateAddressSchema.parse(req.body);
    const address = await addressService.updateAddress(req.params.id, ownerId, validatedData);
    res.status(200).json({
      success: true,
      data: address,
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteAddress(req, res, next) {
  try {
    const ownerId = req.user.userId || req.user.id;
    const address = await addressService.deleteAddress(req.params.id, ownerId);
    res.status(200).json({
      success: true,
      data: address,
      message: 'Address removed successfully',
    });
  } catch (error) {
    next(error);
  }
}

export default {
  listAddresses,
  createAddress,
  getAddress,
  updateAddress,
  deleteAddress,
};
