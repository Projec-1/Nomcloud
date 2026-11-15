/**
 * Nomcloud Fee Configuration - Backend Only
 * Somalia School System
 * Rules: No design touch, use real Supabase, respect valuable code
 * 
 * Elementary: Class 1-4 (A-Z) = $10/month
 * Primary: Class 5-8 (A-Z) = $15/month  
 * Secondary: Form1-Form4 (A-Z) = $20/month (Form1=old Grade9, Form4=old Grade12)
 * 
 * Hormuud: Real number 618880216 for ALL schools (temporary), +252618880216 for Nomcloud subscription
 * Future: Per-school number via schools.hormuud_number column
 */

// Monthly fee tiers in USD - Somalia system
export const FEE_TIERS = {
  ELEMENTARY: 10, // Class 1-4
  PRIMARY: 15,    // Class 5-8
  SECONDARY: 20,  // Form1-Form4
} as const;

// Same for easy import
export const MONTHLY_FEES = {
  elementary: 10,
  primary: 15,
  secondary: 20,
} as const;

// Level type
export type FeeLevel = 'ELEMENTARY' | 'PRIMARY' | 'SECONDARY';

// Grade to level mapping - Class based (Somalia)
// Class 1-4 = Elementary, Class 5-8 = Primary, Form1-4 = Secondary
// Backward compat: Grade 9-12 maps to Form1-4 = Secondary
export const CLASS_NUMBER_TO_LEVEL: Record<number, FeeLevel> = {
  1: 'ELEMENTARY',
  2: 'ELEMENTARY',
  3: 'ELEMENTARY',
  4: 'ELEMENTARY',
  5: 'PRIMARY',
  6: 'PRIMARY',
  7: 'PRIMARY',
  8: 'PRIMARY',
  9: 'SECONDARY',  // Old Grade 9 = Form1
  10: 'SECONDARY', // Old Grade 10 = Form2
  11: 'SECONDARY', // Old Grade 11 = Form3
  12: 'SECONDARY', // Old Grade 12 = Form4
};

// Form number to level - Secondary always
export const FORM_NUMBER_TO_LEVEL: Record<number, FeeLevel> = {
  1: 'SECONDARY',
  2: 'SECONDARY',
  3: 'SECONDARY',
  4: 'SECONDARY',
};

// Get amount by level
export function getFeeAmountByLevel(level: FeeLevel): number {
  return FEE_TIERS[level];
}

// Get amount by class number (1-12)
export function getFeeAmountByClassNumber(classNumber: number): number | null {
  const level = CLASS_NUMBER_TO_LEVEL[classNumber];
  return level ? FEE_TIERS[level] : null;
}

// Get amount by form number (1-4)
export function getFeeAmountByFormNumber(formNumber: number): number | null {
  const level = FORM_NUMBER_TO_LEVEL[formNumber];
  return level ? FEE_TIERS[level] : null;
}

// Hormuud - Real numbers, no fallback guesses
// 618880216 = School fees for ALL existing schools (temporary)
// +252618880216 = Nomcloud platform subscription billing
export const HORMUUD_FEE_NUMBER = '618880216';
export const HORMUUD_FEE_NUMBER_FULL = '+252618880216';
export const NOMCLOUD_SUBSCRIPTION_NUMBER = '+252618880216';

// For future per-school numbers
// TODO: When school registers, add schools.hormuud_number column
// Then: school.hormuud_number || HORMUUD_FEE_NUMBER
export const getSchoolHormuudNumber = (schoolHormuudNumber?: string | null): string => {
  return schoolHormuudNumber?.trim() || HORMUUD_FEE_NUMBER;
};

// USSD instruction - No PIN collection (secure)
export const getHormuudUssdInstruction = (amount: number, number: string = HORMUUD_FEE_NUMBER): string => {
  return `Dial *712*${number}*${amount}# or pay via EVC Plus`;
};

// Monthly fee category prefix - Used for idempotent generation
export const MONTHLY_FEE_CATEGORY_PREFIX = 'Monthly Fee';
export const getMonthlyFeeCategory = (yearMonth: string): string => {
  return `${MONTHLY_FEE_CATEGORY_PREFIX} ${yearMonth}`; // e.g., "Monthly Fee 2026-11"
};
