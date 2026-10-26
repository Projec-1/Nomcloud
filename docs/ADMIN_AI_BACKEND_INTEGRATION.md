# Admin AI frontend integration

Admin AI is a floating assistant shown only in the existing authenticated school-administrator dashboard. It uses the current school context, theme, and language; it does not add an Operator Center route or navigation entry.

## Current prototype boundary

- `src/services/adminAIService.ts` defines `AdminAIService`, `AdminAIResponse`, `AdminAIReport`, and `AdminAIActionPreview`. `demoAdminAIService` is the only implementation and returns clearly labelled illustrative content after a short delay.
- `src/components/dashboard/AdminAIAssistant.tsx` owns the launcher, responsive chat panel, and message presentation. Conversation content exists in React memory only; it is not persisted to local storage.
- Selected attachments are previewed locally in the browser and are not uploaded or analyzed. The demo service receives filenames only to explain that limitation in its response.
- Voice input uses browser speech recognition to transcribe dictated text. Audio is not saved or sent to Nom Cloud; the browser speech provider may process it.
- Demo actions only change the preview's local display state. No message, email, SMS, notification, payment, grade, attendance, student record, timetable, or report operation is performed.
- There is no Gemini client, API key, endpoint, database schema, or production persistence in the browser.

## Backend work required

1. Replace the demo service behind `AdminAIService` with a secure server-side integration. Keep Gemini credentials and model configuration on the server; do not add them to Vite environment variables or browser code.
2. Authenticate each request from the existing signed-in session. The server must independently authorize the current school membership, administrator capabilities, and requested records for every request. Do not trust a client-supplied school ID, role, action, or conversation owner. Enforce school isolation and existing Supabase row-level security.
3. Return the typed response shape consumed by the page: response text, optional structured report metrics and bounded breakdown percentages, and optional action preview. Validate and normalize model output on the server; do not treat generated prose as authoritative data.
4. Define production conversation persistence and retention with the product owner. Any persisted thread must be scoped to its authorized user and school and follow the applicable privacy policy. The current in-memory history must not be treated as production storage.
5. Define a separate, authorized confirmation flow for real actions. The preview must identify the proposed action and affected audience/records. Confirmation must be an explicit user action followed by server-side permission checks, validation, audit logging, and the relevant domain operation. A model response or frontend confirmation must never itself mark payments as paid, issue receipts, alter academic records, or send communications.
6. Add server-side rate limits, usage/cost controls, safe error handling, audit requirements, and any necessary response redaction before enabling non-demo mode.
7. If file understanding is added, define an authenticated upload flow with file-type and size validation, malware/content checks, retention limits, and school-level authorization. The current demo deliberately submits filenames only and never uploads or reads file content. If voice audio rather than browser-transcribed text is needed, define its consent, processing, and retention separately.

No production endpoint names or database schema are prescribed here. Backend and frontend should agree on their contracts before replacing `demoAdminAIService`. Keep the demo marker until a verified, authenticated backend adapter is actually configured; do not infer production readiness from a successful UI response.
