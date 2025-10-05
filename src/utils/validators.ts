import { ValidationError, ValidationResult } from '../core/types';

export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function validateURL(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

export function validatePhoneNumber(phone: string): boolean {
  const phoneRegex = /^\+?[\d\s\-()]{7,15}$/;
  return phoneRegex.test(phone);
}

export function validateRequired(value: any): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}

export function validateMinLength(value: string, minLength: number): boolean {
  return typeof value === 'string' && value.length >= minLength;
}

export function validateMaxLength(value: string, maxLength: number): boolean {
  return typeof value === 'string' && value.length <= maxLength;
}

export function validatePattern(value: string, pattern: RegExp): boolean {
  return typeof value === 'string' && pattern.test(value);
}

export function validateRange(value: number, min?: number, max?: number): boolean {
  if (typeof value !== 'number') return false;
  if (min !== undefined && value < min) return false;
  if (max !== undefined && value > max) return false;
  return true;
}

export function validateObject(
  obj: any,
  schema: {
    [key: string]: {
      required?: boolean;
      type?: 'string' | 'number' | 'boolean' | 'object' | 'array';
      validator?: (value: any) => boolean;
      message?: string;
    };
  }
): ValidationResult {
  const errors: ValidationError[] = [];

  for (const [key, rules] of Object.entries(schema)) {
    const value = obj[key];

    // Check required
    if (rules.required && !validateRequired(value)) {
      errors.push({
        path: key,
        message: rules.message || `${key} is required`,
        code: 'REQUIRED',
        value,
      });
      continue;
    }

    // Skip further validation if value is not present and not required
    if (!validateRequired(value) && !rules.required) {
      continue;
    }

    // Check type
    if (rules.type && !validateType(value, rules.type)) {
      errors.push({
        path: key,
        message: rules.message || `${key} must be of type ${rules.type}`,
        code: 'TYPE_ERROR',
        value,
      });
      continue;
    }

    // Check custom validator
    if (rules.validator && !rules.validator(value)) {
      errors.push({
        path: key,
        message: rules.message || `${key} is invalid`,
        code: 'CUSTOM_VALIDATION',
        value,
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined,
  };
}

export function validateType(value: any, type: string): boolean {
  switch (type) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && !isNaN(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'object':
      return typeof value === 'object' && value !== null && !Array.isArray(value);
    case 'array':
      return Array.isArray(value);
    default:
      return false;
  }
}

export function sanitizeString(
  input: string,
  options?: {
    maxLength?: number;
    allowedChars?: RegExp;
    trim?: boolean;
  }
): string {
  let result = input;

  if (options?.trim !== false) {
    result = result.trim();
  }

  if (options?.maxLength) {
    result = result.substring(0, options.maxLength);
  }

  if (options?.allowedChars) {
    result = result.replace(new RegExp(`[^${options.allowedChars.source}]`, 'g'), '');
  }

  return result;
}

export function sanitizeHTML(input: string): string {
  const entityMap: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
    '/': '&#x2F;',
  };

  return input.replace(/[&<>"'/]/g, char => entityMap[char]);
}

export function validateCreditCard(cardNumber: string): {
  valid: boolean;
  type?: string;
} {
  // Remove spaces and dashes
  const cleaned = cardNumber.replace(/[\s-]/g, '');

  // Check if all digits
  if (!/^\d+$/.test(cleaned)) {
    return { valid: false };
  }

  // Luhn algorithm
  let sum = 0;
  let isEven = false;

  for (let i = cleaned.length - 1; i >= 0; i--) {
    let digit = parseInt(cleaned[i]);

    if (isEven) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }

    sum += digit;
    isEven = !isEven;
  }

  const valid = sum % 10 === 0;

  if (!valid) {
    return { valid: false };
  }

  // Determine card type
  let type = 'unknown';
  if (/^4/.test(cleaned)) type = 'visa';
  else if (/^5[1-5]/.test(cleaned)) type = 'mastercard';
  else if (/^3[47]/.test(cleaned)) type = 'amex';
  else if (/^6(?:011|5)/.test(cleaned)) type = 'discover';

  return { valid: true, type };
}

export function validateSSN(ssn: string): boolean {
  const cleaned = ssn.replace(/[\s-]/g, '');
  return /^\d{9}$/.test(cleaned) && cleaned !== '000000000';
}

export function validateZipCode(zipCode: string, country: string = 'US'): boolean {
  const patterns: Record<string, RegExp> = {
    US: /^\d{5}(-\d{4})?$/,
    CA: /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/,
    UK: /^[A-Za-z]{1,2}\d[A-Za-z\d]?\s?\d[A-Za-z]{2}$/,
  };

  const pattern = patterns[country.toUpperCase()];
  return pattern ? pattern.test(zipCode) : false;
}

// Validation rule builders
export const Rules = {
  required: (message?: string) => ({
    required: true,
    message: message || 'This field is required',
  }),

  email: (message?: string) => ({
    validator: validateEmail,
    message: message || 'Please enter a valid email address',
  }),

  url: (message?: string) => ({
    validator: validateURL,
    message: message || 'Please enter a valid URL',
  }),

  phone: (message?: string) => ({
    validator: validatePhoneNumber,
    message: message || 'Please enter a valid phone number',
  }),

  minLength: (min: number, message?: string) => ({
    validator: (value: string) => validateMinLength(value, min),
    message: message || `Must be at least ${min} characters long`,
  }),

  maxLength: (max: number, message?: string) => ({
    validator: (value: string) => validateMaxLength(value, max),
    message: message || `Must be no more than ${max} characters long`,
  }),

  pattern: (regex: RegExp, message?: string) => ({
    validator: (value: string) => validatePattern(value, regex),
    message: message || 'Invalid format',
  }),

  range: (min?: number, max?: number, message?: string) => ({
    validator: (value: number) => validateRange(value, min, max),
    message: message || `Must be between ${min || '-∞'} and ${max || '∞'}`,
  }),

  custom: (validator: (value: any) => boolean, message: string) => ({
    validator,
    message,
  }),
};
