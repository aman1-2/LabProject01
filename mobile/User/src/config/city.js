/**
 * Dehradun.
 *
 * CONTEXT §2.5: launch is one city. There is no city selector and no hardcoded
 * "12 cities" anywhere — but every query is still scoped by coordinates from
 * day one, which is what preserves the sharding option later.
 *
 * These are the city-centre coordinates, used only as the origin for "labs near
 * you" before the patient has saved an address. Once they have one, their own
 * address is used instead.
 */
export const DEHRADUN = {
  name: 'Dehradun',
  state: 'Uttarakhand',
  lat: 30.3165,
  lng: 78.0322,
};

export default DEHRADUN;
