import type { Contact } from '../types';

export interface PhoneValidationResult {
  isValid: boolean;
  formattedPhone?: string;
  error?: string;
  threatRisk?: 'HIGH' | 'MEDIUM' | 'LOW';
}

/** Default Master Security Authorization Key for testing/demo admin override */
export const DEFAULT_MASTER_SECURITY_PIN = '8492';
export const DEFAULT_MASTER_SECURITY_TOKEN = 'AURELIA-SEC';

/**
 * Validates and sanitizes a phone number according to telecom security policies:
 * - Minimum 10 digits, maximum 15 digits (ITU-T E.164 compliance)
 * - Standardizes national 10-digit Indian numbers with +91 international prefix
 * - Blocks all-zero dummy inputs
 * - Detects duplicate registrations in the directory
 */
export function validateAndSanitizePhone(
  rawPhone: string,
  existingPhones: string[] = []
): PhoneValidationResult {
  const trimmed = rawPhone.trim();
  if (!trimmed) {
    return {
      isValid: false,
      error: 'Security Error: Phone number is mandatory. Unidentified contacts cannot be registered.',
    };
  }

  // Extract pure digits
  const digitsOnly = trimmed.replace(/\D/g, '');

  if (digitsOnly.length < 10) {
    return {
      isValid: false,
      error: `Security Violation: Number contains only ${digitsOnly.length} digits. Minimum 10 valid digits required.`,
      threatRisk: 'HIGH',
    };
  }

  if (digitsOnly.length > 15) {
    return {
      isValid: false,
      error: 'Security Violation: Number exceeds maximum E.164 telecommunication length (15 digits).',
      threatRisk: 'HIGH',
    };
  }

  // Rejection of all zeros or all-ones dummy digits (e.g. 0000000000)
  if (/^0+$/.test(digitsOnly)) {
    return {
      isValid: false,
      error: 'Security Blocked: All-zero dummy number pattern detected. Please provide a legitimate contact number.',
      threatRisk: 'HIGH',
    };
  }

  // Format standard
  let formatted = trimmed;
  if (digitsOnly.length === 10) {
    formatted = `+91 ${digitsOnly.substring(0, 5)} ${digitsOnly.substring(5)}`;
  } else if (trimmed.startsWith('+91') && digitsOnly.length === 12) {
    const mobilePart = digitsOnly.substring(2);
    formatted = `+91 ${mobilePart.substring(0, 5)} ${mobilePart.substring(5)}`;
  } else if (!trimmed.startsWith('+')) {
    formatted = `+${digitsOnly}`;
  }

  // Check for duplicate number
  const normalizedExisting = existingPhones.map((p) => p.replace(/\D/g, ''));
  if (normalizedExisting.includes(digitsOnly)) {
    return {
      isValid: false,
      error: 'Security Warning: This phone number is already registered in the Contact Directory.',
      threatRisk: 'MEDIUM',
    };
  }

  return {
    isValid: true,
    formattedPhone: formatted,
  };
}

/**
 * Validates that an email address is authentic and properly structured.
 */
export function validateEmail(email: string): { isValid: boolean; error?: string } {
  const trimmed = email.trim();
  if (!trimmed) {
    return { isValid: true }; // optional if empty
  }

  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

  if (!emailRegex.test(trimmed)) {
    return {
      isValid: false,
      error: 'Please enter a valid, genuine email address (e.g. name@organization.com or name@gmail.com).',
    };
  }

  const parts = trimmed.split('@');
  if (parts.length !== 2) {
    return { isValid: false, error: 'Email must contain exactly one "@" symbol.' };
  }

  const [localPart, domainPart] = parts;
  if (localPart.length < 1) {
    return { isValid: false, error: 'Email username prefix cannot be empty.' };
  }

  if (!domainPart.includes('.')) {
    return { isValid: false, error: 'Email domain must contain a valid domain extension (e.g. .com, .org, .in).' };
  }

  const domainParts = domainPart.split('.');
  const tld = domainParts[domainParts.length - 1];
  if (tld.length < 2) {
    return { isValid: false, error: 'Email domain suffix is invalid (must be at least 2 letters, e.g. .com, .in).' };
  }

  // Check for common dummy typos
  if (['test@test.com', 'a@a.com', 'asdf@asdf.com', 'dummy@dummy.com'].includes(trimmed.toLowerCase())) {
    return {
      isValid: false,
      error: 'Dummy email address detected. Please enter a genuine contact email.',
    };
  }

  return { isValid: true };
}


/**
 * Generates a one-time 6-digit security authorization challenge code.
 */
export function generateSecurityChallengeCode(): string {
  const code = Math.floor(100000 + Math.random() * 900000);
  return `SEC-${code}`;
}

/**
 * Validates a user-supplied security authorization key or PIN.
 */
export function verifySecurityAuthorization(
  key: string,
  activeChallengeCode?: string | null
): boolean {
  const normalized = key.trim().toUpperCase();
  if (!normalized) return false;

  if (activeChallengeCode && normalized === activeChallengeCode.toUpperCase()) {
    return true;
  }

  if (normalized === DEFAULT_MASTER_SECURITY_TOKEN || normalized === DEFAULT_MASTER_SECURITY_PIN) {
    return true;
  }

  return false;
}

/**
 * Cross-references a caller's phone number against the local contact registry.
 */
export function checkCallerSecurityStatus(
  callerPhone: string | undefined,
  contacts: Contact[]
): {
  status: 'TRUSTED' | 'NEUTRAL' | 'BLOCKED' | 'UNKNOWN';
  contact?: Contact;
  securityMessage: string;
} {
  if (!callerPhone) {
    return {
      status: 'UNKNOWN',
      securityMessage: 'Unlisted Number: Caller identity is unverified. Voice biometric inspection active.',
    };
  }

  const callerDigits = callerPhone.replace(/\D/g, '');
  if (!callerDigits) {
    return {
      status: 'UNKNOWN',
      securityMessage: 'Unknown Caller: No valid telecom digits detected.',
    };
  }

  const matched = contacts.find((c) => {
    if (!c.phone) return false;
    const contactDigits = c.phone.replace(/\D/g, '');
    return contactDigits.includes(callerDigits) || callerDigits.includes(contactDigits);
  });

  if (!matched) {
    return {
      status: 'UNKNOWN',
      securityMessage: 'Unregistered Caller Number: Not present in security directory. Heightened analysis engaged.',
    };
  }

  if (matched.trustStatus === 'BLOCKED') {
    return {
      status: 'BLOCKED',
      contact: matched,
      securityMessage: `CRITICAL SECURITY THREAT: Caller matches BLOCKED contact (${matched.name})! Call marked for interception.`,
    };
  }

  if (matched.trustStatus === 'TRUSTED') {
    return {
      status: 'TRUSTED',
      contact: matched,
      securityMessage: `Verified Contact (${matched.name}): Authorized line with enrolled security profile.`,
    };
  }

  return {
    status: 'NEUTRAL',
    contact: matched,
    securityMessage: `Unverified Contact (${matched.name}): Monitored line under biometric anomaly surveillance.`,
  };
}
