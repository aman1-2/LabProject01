import express from 'express';
import {
  listAddresses,
  createAddress,
  getAddress,
  updateAddress,
  deleteAddress,
} from '../../controllers/addressController.js';
import { isAuthenticated } from '../../middlewares/authMiddleware.js';

const router = express.Router();

router.use(isAuthenticated);

router.get('/', listAddresses);
router.post('/', createAddress);
router.get('/:id', getAddress);
router.patch('/:id', updateAddress);
router.delete('/:id', deleteAddress);

export default router;
