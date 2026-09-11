import { familyMemberService } from '../services/familyMemberService.js';
import { createFamilyMemberSchema, updateFamilyMemberSchema } from '@pathcare/validators';

export async function listMembers(req, res, next) {
  try {
    const ownerId = req.user.userId || req.user.id;
    const members = await familyMemberService.getMembers(ownerId);
    res.status(200).json({
      success: true,
      data: members,
    });
  } catch (error) {
    next(error);
  }
}

export async function addMember(req, res, next) {
  try {
    const ownerId = req.user.userId || req.user.id;
    const validatedData = createFamilyMemberSchema.parse(req.body);
    const result = await familyMemberService.addMember({
      ownerId,
      memberData: validatedData,
    });
    res.status(201).json({
      success: true,
      data: result.member,
      accountType: result.accountType,
    });
  } catch (error) {
    next(error);
  }
}

export async function getMember(req, res, next) {
  try {
    const ownerId = req.user.userId || req.user.id;
    const member = await familyMemberService.getMemberById(req.params.id, ownerId);
    res.status(200).json({
      success: true,
      data: member,
    });
  } catch (error) {
    next(error);
  }
}

export async function updateMember(req, res, next) {
  try {
    const ownerId = req.user.userId || req.user.id;
    const validatedData = updateFamilyMemberSchema.parse(req.body);
    const member = await familyMemberService.updateMember({
      id: req.params.id,
      ownerId,
      updateData: validatedData,
    });
    res.status(200).json({
      success: true,
      data: member,
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteMember(req, res, next) {
  try {
    const ownerId = req.user.userId || req.user.id;
    const member = await familyMemberService.deleteMember(req.params.id, ownerId);
    res.status(200).json({
      success: true,
      data: member,
      message: 'Family member removed successfully',
    });
  } catch (error) {
    next(error);
  }
}
