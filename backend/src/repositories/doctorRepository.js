import { Doctor } from '../schemas/Doctor.js';

export async function findById(id) {
  return Doctor.findById(id).lean();
}

export async function findByUserId(userId) {
  return Doctor.findOne({ userId }).lean();
}

export async function findAllActive() {
  return Doctor.find({ isActive: true }).lean();
}

export async function findDistinctSpecialties() {
  return Doctor.distinct('specialization', { isActive: true });
}

export async function create(doctorData) {
  return Doctor.create(doctorData);
}

export default {
  findById,
  findByUserId,
  findAllActive,
  findDistinctSpecialties,
  create,
};
