import type { Detector } from '../types';
import { emailDetector } from './email';
import { ipv4Detector } from './network';
import { ipv6Detector } from './ipv6';
import { apiKeyDetector, bearerTokenDetector, jwtDetector, secretAssignmentDetector } from './secrets';
import { windowsPathDetector, unixPathDetector } from './paths';
import { uncPathDetector } from './unc';
import { internalUrlDetector, internalHostnameDetector } from './internal';
import { adDnDetector } from './activedirectory';
import { guidDetector } from './guids';
import {
  secureStringLiteralDetector,
  psIdentityParamDetector,
  psServerParamDetector,
  psInfrastructureAssignmentDetector,
} from './powershell';
import { ticketIdDetector } from './tickets';
import { usernameDetector } from './usernames';
import { personNameDetector, orgNameDetector } from './strict';
import { privateKeyDetector } from './privatekeys';
import { connectionStringDetector } from './connections';
import { paymentCardDetector } from './paymentcards';
import {
  phoneDetector,
  addressDetector,
  dobDetector,
  sinDetector,
  healthIdDetector,
} from './pii';
import { caPostalCodeDetector, usSsnDetector, usZipDetector, ibanDetector } from './regional';

/**
 * The full detection registry, including strict-only rules. Which rules
 * actually run is decided per scan via ScanOptions.enabledDetectorIds —
 * these definitions are never mutated.
 */
export const detectors: Detector[] = [
  privateKeyDetector,
  connectionStringDetector,
  paymentCardDetector,
  bearerTokenDetector,
  apiKeyDetector,
  jwtDetector,
  secureStringLiteralDetector,
  adDnDetector,
  guidDetector,
  secretAssignmentDetector,
  internalUrlDetector,
  uncPathDetector,
  windowsPathDetector,
  unixPathDetector,
  emailDetector,
  psInfrastructureAssignmentDetector,
  psIdentityParamDetector,
  psServerParamDetector,
  ipv6Detector,
  ipv4Detector,
  internalHostnameDetector,
  ticketIdDetector,
  usernameDetector,
  personNameDetector,
  orgNameDetector,
  sinDetector,
  healthIdDetector,
  phoneDetector,
  dobDetector,
  addressDetector,
  ibanDetector,
  usSsnDetector,
  caPostalCodeDetector,
  usZipDetector,
];
