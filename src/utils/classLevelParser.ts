/**
 * Nomcloud Class Level Parser - Backend Only
 * Somalia System: CLASS not GRADE, FORM1-FORM4 for secondary
 * Rules: No design, pure utility, respect valuable code, no side effects
 * 
 * Supports:
 * - Elementary: Class 1,2,3,4 + A-Z (Class1A, Class 1 B, Class 1) = $10
 * - Primary: Class 5,6,7,8 + A-Z (Class5A, Class 5 A-Z, Class8 Z) = $15
 * - Secondary: Form1,2,3,4 + A-Z (Form1, Form1A, Form 2 B, F1, F2) = $20
 * - Backward: Grade1A->Class1A, Grade5->Class5, Grade9->Form1, Grade12->Form4
 */

import { 
  FEE_TIERS, 
  CLASS_NUMBER_TO_LEVEL, 
  FORM_NUMBER_TO_LEVEL,
  type FeeLevel 
} from '@/config/feeConfig';

export interface ParsedClassLevel {
  originalName: string;
  displayName: string; // Normalized: Class 1A, Form 1A
  level: FeeLevel;
  monthlyFee: number;
  classNumber?: number; // 1-12
  formNumber?: number;  // 1-4
  subClass?: string;    // A-Z
  isForm: boolean;
}

export interface ParseResult {
  monthlyFee: number | null;
  displayName: string | null;
  level: FeeLevel | null;
}

/**
 * Parse class name to get fee level and display name
 * Somalia system: CLASS not GRADE
 */
export function parseClassLevel(className: string): ParsedClassLevel | null {
  if (!className || typeof className !== 'string') return null;

  const original = className.trim();
  if (!original) return null;

  const lower = original.toLowerCase();

  // 1. Check for Form first - Secondary (Form1-Form4)
  // Patterns: Form1, Form 1, Form1A, Form 1 B, Form 2 B, F1, F2, Secondary Form1
  const formPatterns = [
    /form\s*([1-4])\s*([a-z])?/i,           // Form1, Form 1, Form1A, Form 1 B
    /^\s*f\s*([1-4])\s*([a-z])?\s*$/i,       // F1, F1A, F2
    /f\s*([1-4])\s*([a-z])?/i,           // Word boundary F1
  ];

  for (const pattern of formPatterns) {
    const match = lower.match(pattern);
    if (match) {
      const formNum = parseInt(match[1], 10);
      if (formNum >= 1 && formNum <= 4) {
        const subClass = match[2] ? match[2].toUpperCase() : undefined;
        const level: FeeLevel = FORM_NUMBER_TO_LEVEL[formNum];
        const fee = FEE_TIERS[level];
        
        // Display: Form 1, Form 1A, Form 2 B
        let display = `Form ${formNum}`;
        if (subClass) display += subClass;

        return {
          originalName: original,
          displayName: display,
          level,
          monthlyFee: fee,
          formNumber: formNum,
          subClass,
          isForm: true,
        };
      }
    }
  }

  // 2. Check for Class number 1-12 - Elementary/Primary/Secondary
  // Patterns: Class1A, Class 1 B, Class 1, Class5A, Class 5 A-Z, Class8 Z, 1A, 5B
  // Also backward: Grade1A, Grade5, Grade9
  const classPatterns = [
    /(?:class|grade|fasalka|form)\s*([0-9]{1,2})\s*([a-z])?/i, // Class1A, Grade1A, Class 1 B
    /^\s*([0-9]{1,2})\s*([a-z])\s*$/i,                         // 1A, 5B
    /^\s*([0-9]{1,2})\s*$/i,                                   // 1, 5
  ];

  for (const pattern of classPatterns) {
    const match = lower.match(pattern);
    if (match) {
      const classNum = parseInt(match[1], 10);
      if (classNum >= 1 && classNum <= 12) {
        const subClass = match[2] ? match[2].toUpperCase() : undefined;
        const level = CLASS_NUMBER_TO_LEVEL[classNum];
        if (!level) continue;
        
        const fee = FEE_TIERS[level];
        const isForm = classNum >= 9; // Grade 9-12 = Form1-4

        // Display normalization: CLASS not GRADE
        // 1-8 => Class X, 9-12 => Form X-8 (Grade9=Form1)
        let display: string;
        if (isForm) {
          const formNum = classNum - 8; // 9->1, 10->2, 11->3, 12->4
          display = `Form ${formNum}`;
          if (subClass) display += subClass;
          
          return {
            originalName: original,
            displayName: display,
            level,
            monthlyFee: fee,
            classNumber: classNum,
            formNumber: formNum,
            subClass,
            isForm: true,
          };
        } else {
          // Class 1-8
          display = `Class ${classNum}`;
          if (subClass) display += subClass;
          
          return {
            originalName: original,
            displayName: display,
            level,
            monthlyFee: fee,
            classNumber: classNum,
            subClass,
            isForm: false,
          };
        }
      }
    }
  }

  return null;
}

/**
 * Format class name for display - CLASS not GRADE
 * Grade1A => Class 1A, Grade9 => Form 1, Form1A => Form 1A
 */
export function formatClassName(className: string): string {
  const parsed = parseClassLevel(className);
  return parsed?.displayName || className.trim();
}

/**
 * Get monthly fee from class name
 * Returns null if cannot parse
 */
export function getMonthlyFeeFromClassName(className: string): number | null {
  const parsed = parseClassLevel(className);
  return parsed?.monthlyFee || null;
}

/**
 * Get fee level from class name
 */
export function getFeeLevelFromClassName(className: string): FeeLevel | null {
  const parsed = parseClassLevel(className);
  return parsed?.level || null;
}

/**
 * Test cases for validation - Somalia system
 * These must all pass
 */
export const TEST_CASES: Array<{ input: string; fee: number | null; display: string | null }> = [
  // Elementary Class 1-4 = $10
  { input: 'Class1A', fee: 10, display: 'Class 1A' },
  { input: 'Class 1 B', fee: 10, display: 'Class 1B' },
  { input: 'Class 1', fee: 10, display: 'Class 1' },
  { input: 'Class 4 Z', fee: 10, display: 'Class 4Z' },
  
  // Primary Class 5-8 = $15
  { input: 'Class5A', fee: 15, display: 'Class 5A' },
  { input: 'Class 5 A-Z', fee: 15, display: 'Class 5A' }, // A-Z normalized to A
  { input: 'Class8 Z', fee: 15, display: 'Class 8Z' },
  { input: 'Class 5 B', fee: 15, display: 'Class 5B' },
  
  // Secondary Form1-4 = $20
  { input: 'Form1', fee: 20, display: 'Form 1' },
  { input: 'Form1A', fee: 20, display: 'Form 1A' },
  { input: 'Form 2 B', fee: 20, display: 'Form 2B' },
  { input: 'Form4 Z', fee: 20, display: 'Form 4Z' },
  { input: 'F1', fee: 20, display: 'Form 1' },
  { input: 'F2', fee: 20, display: 'Form 2' },
  
  // Backward compat Grade -> Class/Form
  { input: 'Grade1A', fee: 10, display: 'Class 1A' },
  { input: 'Grade5', fee: 15, display: 'Class 5' },
  { input: 'Grade9', fee: 20, display: 'Form 1' },
  { input: 'Grade12', fee: 20, display: 'Form 4' },
  
  // Invalid
  { input: 'Grade13', fee: null, display: null },
  { input: '', fee: null, display: null },
];
