/**
 * Built in pieces so public secret scanners do not mistake this deliberately
 * fake detector fixture for a live credential.
 */
export const SYNTHETIC_STRIPE_SHAPED_KEY = ['sk', 'live', 'DEMO00000000000000000000'].join('_');
