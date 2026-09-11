import familyMemberRepository from '../repositories/familyMemberRepository.js';
import userRepository from '../repositories/userRepository.js';
import { AppError } from '../utils/AppError.js';

export class FamilyMemberService {
  /**
   * List all family members for an owner
   * @param {string} ownerId
   */
  async getMembers(ownerId) {
    return familyMemberRepository.findByOwnerId(ownerId);
  }

  /**
   * Get a family member by ID, scoped to owner
   * Returns 404 if not owned by caller per CONTEXT §3.2
   * @param {string} id
   * @param {string} ownerId
   */
  async getMemberById(id, ownerId) {
    const member = await familyMemberRepository.findByIdAndOwner(id, ownerId);
    if (!member) {
      throw new AppError('Family member not found', 404, 'FAMILY_MEMBER_NOT_FOUND');
    }
    return member;
  }

  /**
   * Add a family member and automatically convert 'single' account to 'family' per CONTEXT §5.1
   * @param {Object} params
   * @param {string} params.ownerId
   * @param {Object} params.memberData
   */
  async addMember({ ownerId, memberData }) {
    const user = await userRepository.findById(ownerId);
    if (!user) {
      throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    }

    const member = await familyMemberRepository.create({
      ...memberData,
      ownerId,
    });

    // CONTEXT §5.1: If accountType is 'single', adding a member automatically converts it to 'family'
    let accountType = user.accountType;
    if (user.accountType === 'single') {
      const updatedUser = await userRepository.update(ownerId, { accountType: 'family' });
      accountType = updatedUser ? updatedUser.accountType : 'family';
    }

    return {
      member,
      accountType,
    };
  }

  /**
   * Update a family member, scoped to owner
   * Returns 404 if not owned by caller per CONTEXT §3.2
   * @param {Object} params
   * @param {string} params.id
   * @param {string} params.ownerId
   * @param {Object} params.updateData
   */
  async updateMember({ id, ownerId, updateData }) {
    const member = await familyMemberRepository.updateByIdAndOwner(id, ownerId, updateData);
    if (!member) {
      throw new AppError('Family member not found', 404, 'FAMILY_MEMBER_NOT_FOUND');
    }
    return member;
  }

  /**
   * Delete a family member, scoped to owner
   * Returns 404 if not owned by caller per CONTEXT §3.2
   * @param {string} id
   * @param {string} ownerId
   */
  async deleteMember(id, ownerId) {
    const member = await familyMemberRepository.deleteByIdAndOwner(id, ownerId);
    if (!member) {
      throw new AppError('Family member not found', 404, 'FAMILY_MEMBER_NOT_FOUND');
    }
    return member;
  }
}

export const familyMemberService = new FamilyMemberService();
