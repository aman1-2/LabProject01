import express from 'express';
import {
  listMembers,
  addMember,
  getMember,
  updateMember,
  deleteMember,
} from '../../controllers/familyMemberController.js';
import { isAuthenticated } from '../../middlewares/authMiddleware.js';

const router = express.Router();

// All family member routes require authentication
router.use(isAuthenticated);

// GET /api/family-members - list current user's family members
router.get('/', listMembers);

// POST /api/family-members - add a family member
router.post('/', addMember);

// GET /api/family-members/:id - get member details (404 if not owned)
router.get('/:id', getMember);

// PATCH /api/family-members/:id - update member details (404 if not owned)
router.patch('/:id', updateMember);

// DELETE /api/family-members/:id - delete member (404 if not owned)
router.delete('/:id', deleteMember);

export default router;
