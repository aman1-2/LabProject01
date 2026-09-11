import express from 'express';
import { postCartQuote } from '../../controllers/cartController.js';
import { validateBody } from '../../middlewares/validateRequest.js';
import { cartQuoteSchema } from '@pathcare/validators';

const router = express.Router();

// POST /api/cart/quote — price a basket server-side (public, read-only).
// A POST rather than a GET because a cart of 20 slugs does not belong in a
// query string, and this creates nothing.
router.post('/quote', validateBody(cartQuoteSchema), postCartQuote);

export default router;
