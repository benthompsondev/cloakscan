import type { Detector } from '../types';
import { regexMatches } from './helpers';

/** Standard email addresses, e.g. alex.demo@example.internal. */
const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+\b/g;

export const emailDetector: Detector = {
  id: 'email',
  name: 'Email address',
  category: 'personal',
  severity: 'medium',
  label: 'EMAIL',
  priority: 70,
  explanation: 'Email addresses identify people and often reveal internal domains.',
  detect: (text) => regexMatches(text, EMAIL_RE),
};
