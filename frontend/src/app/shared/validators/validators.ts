import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/** Checks that the control value matches another control's value */
export function matchValidator(matchControlName: string, label = 'Passwords'): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const matchControl = control.root.get(matchControlName);
    if (!matchControl) return null;
    return control.value === matchControl.value ? null : { mismatch: `${label} do not match` };
  };
}

/** Minimum-length validator with a human-readable message */
export function minLengthMsg(min: number, field = 'Value'): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    if (!control.value) return null;
    return control.value.length >= min ? null : { minLength: `${field} must be at least ${min} characters` };
  };
}

/** Password strength: at least 8 chars, upper, lower, digit, special char */
export function passwordStrength(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const v = control.value;
    if (!v) return null;
    if (v.length < 8) return { passwordStrength: 'Password must be at least 8 characters' };
    if (!/[A-Z]/.test(v)) return { passwordStrength: 'Password must include an uppercase letter' };
    if (!/[a-z]/.test(v)) return { passwordStrength: 'Password must include a lowercase letter' };
    if (!/\d/.test(v)) return { passwordStrength: 'Password must include a number' };
    if (!/[!@#$%^&*()_+=[\]{};':"\\|,.<>/?-]/.test(v)) return { passwordStrength: 'Password must include a special character' };
    return null;
  };
}

/** Email validator with a human-readable message */
export function emailValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    if (!control.value) return null;
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return emailRegex.test(control.value) ? null : { email: 'Please enter a valid email address' };
  };
}

/** Phone number validator (country code + 10 digits) */
export function phoneValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    if (!control.value) return null;
    const phoneRegex = /^\+\d{1,3}[6-9]\d{9}$/;
    return phoneRegex.test(control.value.replace(/[\s-]/g, ''))
      ? null
      : { phone: 'Phone must include country code followed by 10 digits (e.g. +919876543210)' };
  };
}

/** PAN validator (5 uppercase letters + 4 digits + 1 uppercase letter) */
export function panValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    if (!control.value) return null;
    const panRegex = /^[A-Z]{5}\d{4}[A-Z]$/;
    return panRegex.test(control.value)
      ? null
      : { pan: 'PAN must be 10 characters: 5 capital letters, 4 digits, 1 capital letter (e.g. ABCDE1234F)' };
  };
}

/** Aadhaar number validator (exactly 12 digits) */
export function aadhaarValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    if (!control.value) return null;
    const cleaned = control.value.replace(/[\s-]/g, '');
    return /^\d{12}$/.test(cleaned)
      ? null
      : { aadhaar: 'Aadhaar number must be exactly 12 digits' };
  };
}

/** Required field with custom message */
export function requiredMsg(field = 'This field'): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const empty = control.value === null || control.value === undefined || control.value === '' ||
      (typeof control.value === 'string' && !control.value.trim());
    return empty ? { required: `${field} is required` } : null;
  };
}
