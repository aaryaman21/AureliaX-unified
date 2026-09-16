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
 * - Detects and blocks repetitive dummy numbers (e.g. 0000000000, 9999999999)
 * - Detects and blocks sequential dummy numbers (e.g. 1234567890, 0123456789)
 * - Detects and blocks known unauthorized test patterns (e.g. 9000000000)
 * - Standardizes national 10-digit Indian numbers with +91 international prefix
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

  // Rejection of repetitive dummy digits (e.g. 0000000000, 1111111111, 9999999999)
  if (/^(\d)\1+$/.test(digitsOnly)) {
    return {
      isValid: false,
      error: 'Security Blocked: Repetitive dummy number pattern detected. Fake phone numbers are rejected.',
      threatRisk: 'HIGH',
    };
  }

  // Rejection of sequential numbers (e.g. 1234567890, 0123456789)
  if ('0123456789012345'.includes(digitsOnly) || '9876543210987654'.includes(digitsOnly)) {
    return {
      isValid: false,
      error: 'Security Blocked: Sequential number pattern detected. Unverified sequential numbers are prohibited.',
      threatRisk: 'HIGH',
    };
  }

  // Rejection of known dummy/unauthorized test vectors
  const blockedPatterns = ['9000000000', '0000000000', '1234512345', '9999900000', '9876500000'];
  if (blockedPatterns.some((pattern) => digitsOnly.includes(pattern))) {
    return {
      isValid: false,
      error: 'Security Blocked: Known unauthorized dummy number vector. Please provide a verified line.',
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
