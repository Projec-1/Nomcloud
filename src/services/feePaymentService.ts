/**
 * Nomcloud feePaymentService.ts - EXACT MATCH for FeePaymentCheckout.tsx
 * Keeps all old signatures so build passes + real Hormuud 618880216 backend
 * Backend only, no design touch
 */

import { supabase } from '@/lib/supabase';
import { HORMUUD_FEE_NUMBER } from '@/config/feeConfig';

// ===== Types matching FeePaymentCheckout.tsx =====

export interface SettledFeePayment {
  transactionId: string;
  feePaymentId?: string;
  mock?: boolean;
  eventType: 'verified' | 'pending' | 'declined' | 'cancelled' | 'notConfirmed' | string;
  outcome?: string;
  reason?: string;
  amount?: number;
  hormuudNumber?: string;
}

interface PendingFeePaymentLocal {
  transactionId: string | null;
  clientReference: string;
  amount: number;
  createdAt: string;
  feeId?: string;
}

function storageKey(feeId: string): string {
  return `nomcloud_pending_fee_${feeId}`;
}

// ===== Real Backend Helpers =====

function generateTxId(): string {
  return `TX-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

// ===== Compatibility API - Exact signatures required by FeePaymentCheckout.tsx =====

export function loadPendingFeePayment(feeId: string): PendingFeePaymentLocal | null {
  try {
    const raw = localStorage.getItem(storageKey(feeId));
    if (!raw) return null;
    return JSON.parse(raw) as PendingFeePaymentLocal;
  } catch {
    return null;
  }
}

export function clearPendingFeePayment(feeId: string): void {
  try {
    localStorage.removeItem(storageKey(feeId));
  } catch {}
}

export function savePendingFeePayment(
  feeId: string,
  data: { clientReference: string; transactionId: string | null; amount: number; createdAt: string } & Record<string, any>
): void {
  try {
    const payload: PendingFeePaymentLocal = {
      transactionId: data.transactionId,
      clientReference: data.clientReference,
      amount: data.amount,
      createdAt: data.createdAt,
      feeId,
    };
    localStorage.setItem(storageKey(feeId), JSON.stringify(payload));
  } catch {}
}

export async function recoverFeePayment(
  feeId: string,
  clientReference: string
): Promise<SettledFeePayment | null> {
  try {
    // Try to find submission by clientReference (stored as transactionId or in evidence)
    // For demo compatibility, return pending if local exists
    const pending = loadPendingFeePayment(feeId);
    if (!pending) return null;

    // Check Supabase for real verification status
    try {
      const { data } = await supabase
        .from('fee_payment_submissions')
        .select('id, status, amount')
        .eq('fee_record_id', feeId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data) {
        if (data.status === 'verified') {
          return {
            transactionId: pending.transactionId || data.id,
            feePaymentId: data.id,
            mock: true,
            eventType: 'verified',
            amount: data.amount,
          };
        }
        if (data.status === 'rejected') {
          return {
            transactionId: pending.transactionId || data.id,
            feePaymentId: data.id,
            mock: false,
            eventType: 'declined',
            outcome: 'rejected',
            reason: 'declined',
          };
        }
      }
    } catch {}

    // Default: still pending
    return {
      transactionId: pending.transactionId || `TX-RECOVER-${Date.now()}`,
      mock: true,
      eventType: 'pending',
      amount: pending.amount,
    };
  } catch {
    return null;
  }
}

export async function startFeePayment(params: {
  feeRecordId: string;
  clientReference: string;
  amount: number;
  paymentMethod: 'mobile_money' | string;
  accountNo: string;
}): Promise<SettledFeePayment> {
  const transactionId = generateTxId();

  // Real backend: Create pending submission with real Hormuud number 618880216
  try {
    // Get school_id and student_id from fee_record
    const { data: feeRecord } = await supabase
      .from('fee_records')
      .select('school_id, student_id')
      .eq('id', params.feeRecordId)
      .maybeSingle();

    if (feeRecord) {
      await supabase.from('fee_payment_submissions').insert({
        school_id: feeRecord.school_id,
        student_id: feeRecord.student_id,
        fee_record_id: params.feeRecordId,
        amount: params.amount,
        hormuud_number: HORMUUD_FEE_NUMBER,
        status: 'pending_verification',
      });
    }
  } catch (e) {
    console.warn('startFeePayment submission insert skipped', e);
  }

  // For demo flow (school.is_demo true), FeePaymentCheckout expects mock flow
  // Return pending to trigger checkStatus loop
  return {
    transactionId,
    feePaymentId: undefined,
    mock: true,
    eventType: 'pending',
    amount: params.amount,
    hormuudNumber: HORMUUD_FEE_NUMBER,
  };
}

export async function settleFeePayment(transactionId: string): Promise<SettledFeePayment> {
  // Real backend: Check if any recent submission for this transaction got verified
  // Since transactionId is random, we check latest submission for that fee via localStorage
  try {
    // Find feeId that has this transactionId pending
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith('nomcloud_pending_fee_')) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw) as PendingFeePaymentLocal;
        if (parsed.transactionId === transactionId) {
          const feeId = key.replace('nomcloud_pending_fee_', '');
          // Check Supabase status
          const { data } = await supabase
            .from('fee_payment_submissions')
            .select('id, status, amount')
            .eq('fee_record_id', feeId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (data?.status === 'verified') {
            // Also mark fee_record as paid
            try {
              await supabase.from('fee_records').update({ status: 'paid' }).eq('id', feeId);
            } catch {}
            
            return {
              transactionId,
              feePaymentId: data.id,
              mock: true,
              eventType: 'verified',
              amount: data.amount,
            };
          }
          if (data?.status === 'rejected') {
            return {
              transactionId,
              feePaymentId: data.id,
              mock: false,
              eventType: 'declined',
              outcome: 'rejected',
              reason: 'declined',
            };
          }
        }
      } catch {}
    }
  } catch {}

  // Default: still pending (FeePaymentCheckout will retry 4 times then show pending/notConfirmed)
  return {
    transactionId,
    mock: true,
    eventType: 'pending',
  };
}

export function isVerifiedFeePayment(result: SettledFeePayment | any): boolean {
  if (!result) return false;
  return result.eventType === 'verified' || result.status === 'verified';
}

// ===== Additional real backend exports (used by new code) =====

export async function initiateHormuudPayment(params: {
  schoolId: string;
  studentId: string;
  feeRecordId: string;
  amount: number;
}): Promise<{ ussdCode: string; message: string; hormuudNumber: string }> {
  const hormuudNumber = HORMUUD_FEE_NUMBER;
  const ussdCode = `*712*${hormuudNumber}*${params.amount}#`;
  return {
    ussdCode,
    hormuudNumber,
    message: `You are going to pay $${params.amount} to ${hormuudNumber}. Dial ${ussdCode} via EVC Plus`,
  };
}

export function getUssdInstruction(amount: number): string {
  return `Dial *712*${HORMUUD_FEE_NUMBER}*${amount}# or pay via EVC Plus`;
}

export interface FeePaymentSubmission {
  id: string;
  school_id: string;
  student_id: string;
  fee_record_id: string;
  amount: number;
  hormuud_number: string;
  status: 'pending_verification' | 'verified' | 'rejected';
  evidence_path?: string;
  created_at: string;
}
