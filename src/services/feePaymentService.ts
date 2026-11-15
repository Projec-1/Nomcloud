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
  mock: boolean;
  eventType: 'verified' | 'pending' | 'declined' | 'cancelled' | 'notConfirmed' | string;
  outcome?: string;
  reason?: string;
  amount?: number;
  hormuudNumber?: string;
  status?: string;
}

export interface PendingFeePaymentLocal {
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

function responseObject(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('The payment service returned an invalid response.')
  }
  return value as Record<string, unknown>
}

// ===== Compatibility API - Exact signatures required by FeePaymentCheckout.tsx =====

export function loadPendingFeePayment(feeId: string): PendingFeePaymentLocal | null {
  const raw = window.localStorage.getItem(storageKey(feeId))
  if (!raw) return null

  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    throw new Error('The saved payment attempt is invalid. Check its status before starting another payment.')
  }
  if (typeof value !== 'object' || value === null) {
    throw new Error('The saved payment attempt is invalid. Check its status before starting another payment.')
  }

  const attempt = value as Partial<PendingFeePaymentLocal>
  if (
    typeof attempt.clientReference !== 'string' ||
    typeof attempt.amount !== 'number' ||
    !Number.isFinite(attempt.amount) ||
    typeof attempt.createdAt !== 'string' ||
    (attempt.transactionId !== null && typeof attempt.transactionId !== 'string')
  ) {
    throw new Error('The saved payment attempt is invalid. Check its status before starting another payment.')
  }
  return attempt as PendingFeePaymentLocal
}

export function clearPendingFeePayment(feeId: string): void {
  window.localStorage.removeItem(storageKey(feeId))
}

export function savePendingFeePayment(
  feeId: string,
  data: PendingFeePaymentLocal,
): void {
  const payload: PendingFeePaymentLocal = {
    transactionId: data.transactionId,
    clientReference: data.clientReference,
    amount: data.amount,
    createdAt: data.createdAt,
    feeId,
  }
  window.localStorage.setItem(storageKey(feeId), JSON.stringify(payload))
}

export async function recoverFeePayment(
  feeId: string,
  clientReference: string
): Promise<SettledFeePayment | null> {
  const pending = loadPendingFeePayment(feeId)
  if (!pending) return null

  const { data, error } = await supabase
    .from('fee_payment_submissions')
    .select('id, status, amount, transaction_id, review_note')
    .eq('fee_record_id', feeId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!data) return null

  const transactionId = data.transaction_id ?? pending.transactionId ?? clientReference
  if (data.status === 'verified') {
    return {
      transactionId,
      feePaymentId: data.id,
      mock: true,
      eventType: 'verified',
      amount: data.amount,
      status: data.status,
    }
  }
  if (data.status === 'rejected') {
    return {
      transactionId,
      feePaymentId: data.id,
      mock: true,
      eventType: 'declined',
      outcome: 'rejected',
      reason: data.review_note ?? 'declined',
      amount: data.amount,
      status: data.status,
    }
  }
  return {
    transactionId,
    mock: true,
    eventType: 'pending',
    amount: data.amount,
    status: data.status,
  }
}

export async function startFeePayment(params: {
  feeRecordId: string;
  clientReference: string;
  amount: number;
  paymentMethod: 'mobile_money' | string;
  accountNo: string;
}): Promise<SettledFeePayment> {
  if (!Number.isFinite(params.amount) || params.amount <= 0) {
    throw new Error('Payment amount must be a positive number.')
  }
  if (!params.accountNo.trim()) throw new Error('Enter the EVC Plus number used for payment.')
  const transactionId = generateTxId();

  const { data: feeRecord, error: feeError } = await supabase
    .from('fee_records')
    .select('school_id, student_id')
    .eq('id', params.feeRecordId)
    .maybeSingle()
  if (feeError) throw feeError
  if (!feeRecord) throw new Error('Fee record not found.')

  const body = new FormData()
  body.set('school_id', feeRecord.school_id)
  body.set('student_id', feeRecord.student_id)
  body.set('fee_record_id', params.feeRecordId)
  body.set('amount', params.amount.toFixed(2))
  body.set('payer_number', params.accountNo.trim())
  body.set('transaction_id', transactionId)

  const { data, error } = await supabase.functions.invoke('initiate-hormuud-fee-payment', { body })
  if (error) throw new Error(error.message || 'Could not submit the Hormuud payment for verification.')

  const result = responseObject(data)
  if (
    typeof result.submission_id !== 'string' ||
    result.status !== 'pending_verification' ||
    typeof result.amount !== 'number' ||
    result.amount !== params.amount
  ) {
    throw new Error('The payment service returned incomplete submission details.')
  }

  return {
    transactionId,
    mock: true,
    eventType: 'pending',
    amount: result.amount,
    hormuudNumber: HORMUUD_FEE_NUMBER,
  }
}

export async function settleFeePayment(transactionId: string): Promise<SettledFeePayment> {
  const prefix = 'nomcloud_pending_fee_'
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index)
    if (!key?.startsWith(prefix)) continue
    const feeId = key.slice(prefix.length)
    const pending = loadPendingFeePayment(feeId)
    if (!pending || pending.transactionId !== transactionId) continue

    const { data, error } = await supabase
      .from('fee_payment_submissions')
      .select('id, status, amount, transaction_id, review_note')
      .eq('fee_record_id', feeId)
      .eq('transaction_id', pending.transactionId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw error
    if (!data) break

    if (data.status === 'verified') {
      return {
        transactionId: data.transaction_id ?? transactionId,
        feePaymentId: data.id,
        mock: true,
        eventType: 'verified',
        amount: data.amount,
        status: data.status,
      }
    }
    if (data.status === 'rejected') {
      return {
        transactionId: data.transaction_id ?? transactionId,
        feePaymentId: data.id,
        mock: true,
        eventType: 'declined',
        outcome: 'rejected',
        reason: data.review_note ?? 'declined',
        amount: data.amount,
        status: data.status,
      }
    }
    return {
      transactionId: data.transaction_id ?? transactionId,
      mock: true,
      eventType: 'pending',
      amount: data.amount,
      status: data.status,
    }
  }

  return {
    transactionId,
    mock: true,
    eventType: 'pending',
  };
}

export function isVerifiedFeePayment(result: SettledFeePayment): boolean {
  return result.eventType === 'verified' || result.status === 'verified'
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
  currency: string;
  method: 'hormuud_evc';
  payer_number: string;
  transaction_id: string | null;
  status: 'pending_verification' | 'verified' | 'rejected';
  evidence_path?: string;
  created_at: string;
}
