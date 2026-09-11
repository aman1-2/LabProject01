import cartService from '../services/cartService.js';

/**
 * POST /api/cart/quote
 *
 * Public on purpose: someone building a basket before they have an account is
 * the normal path, and making them sign in to see a price is how baskets get
 * abandoned. Nothing here reads or writes patient data — it prices catalogue
 * entries, which are public already.
 */
export async function postCartQuote(req, res, next) {
  try {
    const quote = await cartService.quoteCart({
      items: req.body.items,
      labCenterId: req.body.labCenterId ?? null,
      lat: req.body.lat,
      lng: req.body.lng,
    });

    res.status(200).json({
      success: true,
      data: quote,
    });
  } catch (error) {
    next(error);
  }
}

export default { postCartQuote };
