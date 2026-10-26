import type { Lang } from '@/data/translations'

export interface AdminAIReport {
  title: string
  metrics: { label: string; value: string; note: string }[]
  breakdown: { label: string; value: number }[]
}

export interface AdminAIActionPreview {
  title: string
  audience: string
  message: string
}

export interface AdminAIResponse {
  text: string
  report?: AdminAIReport
  action?: AdminAIActionPreview
}

export interface AdminAIService {
  readonly mode: 'demo' | 'connected'
  sendMessage: (message: string, language: Lang, attachmentNames?: string[]) => Promise<AdminAIResponse>
}

const demoDelay = () => new Promise<void>((resolve) => window.setTimeout(resolve, 420))

function getDemoAction(message: string, isArabic: boolean): AdminAIActionPreview | undefined {
  if (!/\b(draft|remind|reminder|announcement|message|send|prepare|update|change)\b/i.test(message) && !/اكتب|تذكير|إعلان|أرسل|تغيير|تحديث/.test(message)) {
    return undefined
  }

  const isFeeReminder = /fee|payment|balance|رسوم|دفع|رصيد/i.test(message)
  return isArabic
    ? {
        title: isFeeReminder ? 'معاينة تذكير بالرسوم' : 'معاينة رسالة مدرسية',
        audience: isFeeReminder ? 'أولياء أمور افتراضيون — بيانات توضيحية فقط' : 'جمهور افتراضي — بيانات توضيحية فقط',
        message: isFeeReminder
          ? 'مسودة توضيحية: نرجو مراجعة رصيد الرسوم المستحق في سجلات المدرسة الرسمية والتواصل مع الإدارة عند الحاجة.'
          : 'مسودة توضيحية: يرجى مراجعة الإعلان المقترح وإجراء أي تعديلات قبل استخدامه.',
      }
    : {
        title: isFeeReminder ? 'Fee reminder preview' : 'School message preview',
        audience: isFeeReminder ? 'Sample guardians — demonstration only' : 'Sample audience — demonstration only',
        message: isFeeReminder
          ? 'Sample draft: Please review the outstanding fee balance in the school’s verified records and contact the administration if you need assistance.'
          : 'Sample draft: Please review this proposed announcement and make any changes before using it.',
      }
}

function buildDemoResponse(message: string, language: Lang, attachmentNames: string[] = []): AdminAIResponse {
  const isArabic = language === 'ar'
  const action = getDemoAction(message, isArabic)
  const lower = message.toLowerCase()
  if (/attend|absen|late|حضور|غياب|تأخر/.test(lower) || /حضور|غياب|تأخر/.test(message)) {
    return {
      text: isArabic
        ? 'هذا ملخص توضيحي للحضور فقط، وليس مستندًا إلى سجلات مدرستك. تحقّق من بيانات الحضور المعتمدة قبل اتخاذ أي إجراء.'
        : 'Here is an illustrative attendance overview only; it does not use your school records. Verify official attendance data before taking action.',
      report: {
        title: isArabic ? 'نظرة عامة على الحضور' : 'Attendance overview',
        metrics: isArabic
          ? [
              { label: 'تم تسجيلهم', value: '214', note: 'عينة توضيحية' },
              { label: 'حاضرون', value: '198', note: 'عينة توضيحية' },
              { label: 'غائبون', value: '12', note: 'عينة توضيحية' },
              { label: 'متأخرون', value: '4', note: 'عينة توضيحية' },
            ]
          : [
              { label: 'Marked', value: '214', note: 'Sample only' },
              { label: 'Present', value: '198', note: 'Sample only' },
              { label: 'Absent', value: '12', note: 'Sample only' },
              { label: 'Late', value: '4', note: 'Sample only' },
            ],
        breakdown: isArabic
          ? [
              { label: 'الصف 5 أ', value: 96 },
              { label: 'الصف 6 أ', value: 92 },
              { label: 'الصف 7 ب', value: 88 },
              { label: 'الصف 8 أ', value: 94 },
            ]
          : [
              { label: 'Class 5A', value: 96 },
              { label: 'Class 6A', value: 92 },
              { label: 'Class 7B', value: 88 },
              { label: 'Class 8A', value: 94 },
            ],
      },
      action,
    }
  }

  if (/fee|payment|collect|balance|رسوم|مدفوعات|تحصيل|رصيد/.test(lower) || /رسوم|مدفوعات|تحصيل|رصيد/.test(message)) {
    return {
      text: isArabic
        ? 'هذه أرقام مالية افتراضية للتوضيح فقط. لا تمثل أي مدفوعات أو أرصدة فعلية، ولا يمكن للمساعد تأكيد الدفع أو إصدار إيصال.'
        : 'These are illustrative sample figures only. They do not represent real payments or balances; the assistant cannot confirm a payment or issue a receipt.',
      report: {
        title: isArabic ? 'ملخص الرسوم' : 'Fee summary',
        metrics: isArabic
          ? [
              { label: 'المحصّل', value: '$18,450', note: 'عينة توضيحية' },
              { label: 'مستحق', value: '$6,280', note: 'عينة توضيحية' },
              { label: 'نسبة التحصيل', value: '74%', note: 'عينة توضيحية' },
            ]
          : [
              { label: 'Collected', value: '$18,450', note: 'Sample only' },
              { label: 'Outstanding', value: '$6,280', note: 'Sample only' },
              { label: 'Collection rate', value: '74%', note: 'Sample only' },
            ],
        breakdown: isArabic
          ? [
              { label: 'الرسوم الدراسية', value: 74 },
              { label: 'النقل', value: 52 },
              { label: 'الوجبات', value: 88 },
            ]
          : [
              { label: 'Tuition', value: 74 },
              { label: 'Transport', value: 52 },
              { label: 'Meals', value: 88 },
            ],
      },
      action,
    }
  }

  if (/student|record|profile|guardian|enrol|enroll|طالب|سجل|ملف|ولي أمر|قيد/.test(lower) || /طالب|سجل|ملف|ولي أمر|قيد/.test(message)) {
    return {
      text: isArabic
        ? 'يمكن للواجهة عرض مؤشرات افتراضية لاكتمال الملفات. لا تتضمن هذه المعاينة أسماء طلاب أو سجلات شخصية حقيقية.'
        : 'The interface can display illustrative profile-completion indicators. This preview contains no real student names or personal records.',
      report: {
        title: isArabic ? 'اكتمال سجلات الطلاب' : 'Student record completeness',
        metrics: isArabic
          ? [
              { label: 'الملفات المكتملة', value: '86%', note: 'عينة توضيحية' },
              { label: 'تحتاج إلى مراجعة', value: '24', note: 'عينة توضيحية' },
            ]
          : [
              { label: 'Profiles complete', value: '86%', note: 'Sample only' },
              { label: 'Need review', value: '24', note: 'Sample only' },
            ],
        breakdown: isArabic
          ? [
              { label: 'الصف 5 أ', value: 92 },
              { label: 'الصف 6 أ', value: 81 },
              { label: 'الصف 7 ب', value: 76 },
              { label: 'الصف 8 أ', value: 88 },
            ]
          : [
              { label: 'Class 5A', value: 92 },
              { label: 'Class 6A', value: 81 },
              { label: 'Class 7B', value: 76 },
              { label: 'Class 8A', value: 88 },
            ],
      },
      action,
    }
  }

  if (/grade|exam|academic|performance|result|assessment|اختبار|أكاديمي|أداء|نتائج|درجات/.test(lower) || /اختبار|أكاديمي|أداء|نتائج|درجات/.test(message)) {
    return {
      text: isArabic
        ? 'هذا مثال على طريقة عرض ملخص أكاديمي. لا يحتوي على درجات فعلية أو تقييم لأي طالب.'
        : 'This is an example of an academic summary layout. It contains no real grades or assessment of any student.',
      report: {
        title: isArabic ? 'ملخص الأداء الأكاديمي' : 'Academic performance summary',
        metrics: isArabic
          ? [
              { label: 'متوسط العينة', value: '78%', note: 'عينة توضيحية' },
              { label: 'الاختبارات القادمة', value: '3', note: 'عينة توضيحية' },
              { label: 'تحتاج إلى مراجعة', value: '2', note: 'عينة توضيحية' },
            ]
          : [
              { label: 'Sample average', value: '78%', note: 'Sample only' },
              { label: 'Upcoming exams', value: '3', note: 'Sample only' },
              { label: 'Need review', value: '2', note: 'Sample only' },
            ],
        breakdown: isArabic
          ? [
              { label: 'العلوم', value: 82 },
              { label: 'الرياضيات', value: 76 },
              { label: 'اللغة', value: 79 },
            ]
          : [
              { label: 'Science', value: 82 },
              { label: 'Mathematics', value: 76 },
              { label: 'Language', value: 79 },
            ],
      },
      action,
    }
  }

  if (/homework|timetable|schedule|activity|announcement|homework|واجب|جدول|نشاط|إعلان/.test(lower) || /واجب|جدول|نشاط|إعلان/.test(message)) {
    return {
      text: isArabic
        ? 'هذه معاينة توضيحية فقط. ستحتاج معلومات الجدول والواجبات والإعلانات إلى مصدر بيانات معتمد قبل عرض نتائج حقيقية.'
        : 'This is a demonstration preview only. Timetable, homework, and announcement results will need a verified data source before they can be considered real.',
      report: {
        title: isArabic ? 'ملخص النشاط المدرسي' : 'School activity summary',
        metrics: isArabic
          ? [
              { label: 'واجبات مستحقة', value: '8', note: 'عينة توضيحية' },
              { label: 'اختبارات قادمة', value: '3', note: 'عينة توضيحية' },
              { label: 'إعلانات هذا الأسبوع', value: '5', note: 'عينة توضيحية' },
            ]
          : [
              { label: 'Homework due', value: '8', note: 'Sample only' },
              { label: 'Upcoming exams', value: '3', note: 'Sample only' },
              { label: 'Announcements this week', value: '5', note: 'Sample only' },
            ],
        breakdown: isArabic
          ? [
              { label: 'واجبات هذا الأسبوع', value: 64 },
              { label: 'الاختبارات المجدولة', value: 42 },
              { label: 'الإعلانات المنشورة', value: 78 },
            ]
          : [
              { label: 'Homework this week', value: 64 },
              { label: 'Exams scheduled', value: 42 },
              { label: 'Announcements published', value: 78 },
            ],
      },
      action,
    }
  }

  if (/report|overview|summary|تقرير|ملخص|نظرة عامة/.test(lower) || /تقرير|ملخص|نظرة عامة/.test(message)) {
    return {
      text: isArabic
        ? 'هذه معاينة لتقرير مدرسي شهري باستخدام بيانات توضيحية فقط، وليست تحليلاً لسجلات مدرستك.'
        : 'This is a monthly school report preview using illustrative sample figures only, not an analysis of your school records.',
      report: {
        title: isArabic ? 'نظرة شهرية على المدرسة' : 'Monthly school overview',
        metrics: isArabic
          ? [
              { label: 'الحضور في العينة', value: '92%', note: 'عينة توضيحية' },
              { label: 'اكتمال الملفات', value: '86%', note: 'عينة توضيحية' },
              { label: 'تحصيل الرسوم', value: '74%', note: 'عينة توضيحية' },
              { label: 'إعلانات هذا الشهر', value: '12', note: 'عينة توضيحية' },
            ]
          : [
              { label: 'Sample attendance', value: '92%', note: 'Sample only' },
              { label: 'Profiles complete', value: '86%', note: 'Sample only' },
              { label: 'Fee collection', value: '74%', note: 'Sample only' },
              { label: 'Announcements this month', value: '12', note: 'Sample only' },
            ],
        breakdown: isArabic
          ? [
              { label: 'الحضور', value: 92 },
              { label: 'اكتمال الملفات', value: 86 },
              { label: 'تحصيل الرسوم', value: 74 },
            ]
          : [
              { label: 'Attendance', value: 92 },
              { label: 'Profile completeness', value: 86 },
              { label: 'Fee collection', value: 74 },
            ],
      },
      action,
    }
  }

  return {
    text: isArabic
      ? 'أنا في وضع العرض التوضيحي ولا أستطيع الوصول إلى بيانات المدرسة. جرّب أحد الاقتراحات، أو اسأل عن الحضور أو الرسوم أو السجلات أو الأداء الأكاديمي.'
      : 'I’m in demonstration mode and cannot access school data. Try a suggestion, or ask about attendance, fees, student records, or academic performance.',
    action,
  }
}

export const demoAdminAIService: AdminAIService = {
  mode: 'demo',
  async sendMessage(message, language, attachmentNames = []) {
    await demoDelay()
    const response = buildDemoResponse(message.trim(), language)
    if (attachmentNames.length > 0) {
      response.text += language === 'ar'
        ? `\n\nمرفقات مختارة: ${attachmentNames.join('، ')}. لم تُرفع الملفات ولم تتم قراءة محتواها في هذا النموذج الأولي.`
        : `\n\nSelected attachments: ${attachmentNames.join(', ')}. Files are not uploaded or read by this prototype.`
    }
    return response
  },
}
