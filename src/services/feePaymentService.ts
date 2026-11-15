/**
 * Nomcloud feePaymentService.ts - Backend Only
 * Hormuud real number 618880216, no PIN, pending verification
 * Rules: No design, real Supabase, no fallback guesses
 */

import { supabase } from '@/lib/supabase';
import { HORMUUD_FEE_NUMBER, getHormuudUssdInstruction } from '@/config/feeConfig';

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

export async function initiateHormuudPayment(params: {
  schoolId: string;
  studentId: string;
  feeRecordId: string;
  amount: number;
}): Promise<{ ussdCode: string; message: string; hormuudNumber: string }> {
  // Real number, no fallback
  const hormuudNumber = HORMUUD_FEE_NUMBER;
  const ussdCode = `*712*${hormuudNumber}*${params.amount}#`;
  
  return {
    ussdCode,
    hormuudNumber,
    message: `You are going to pay $${params.amount} to ${hormuudNumber}. Dial ${ussdCode} via EVC Plus`,
  };
}

export async function submitPaymentEvidence(params: {
  schoolId: string;
  studentId: string;
  feeRecordId: string;
  amount: number;
  evidenceFile: File;
}): Promise<FeePaymentSubmission> {
  const evidencePath = `payment-evidence/${params.schoolId}/${params.studentId}/${Date.now()}_${params.evidenceFile.name}`;

  // Upload to payment-evidence bucket
  const { error: uploadError } = await supabase.storage
    .from('payment-evidence')
    .upload(evidencePath, params.evidenceFile);

  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from('fee_payment_submissions')
    .insert({
      school_id: params.schoolId,
      student_id: params.studentId,
      fee_record_id: params.feeRecordId,
      amount: params.amount,
      hormuud_number: HORMUUD_FEE_NUMBER,
      status: 'pending_verification',
      evidence_path: evidencePath,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getPaymentSubmissions(schoolId: string, studentId?: string): Promise<FeePaymentSubmission[]> {
  let query = supabase
    .from('fee_payment_submissions')
    .select('*')
    .eq('school_id', schoolId)
    .order('created_at', { ascending: false });

  if (studentId) {
    query = query.eq('student_id', studentId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export function getUssdInstruction(amount: number): string {
  return getHormuudUssdInstruction(amount, HORMUUD_FEE_NUMBER);
}
