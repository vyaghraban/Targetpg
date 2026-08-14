// =====================================================================
// SUPABASE CLIENT — replaces fb-adapter.js (Firebase + Cloudinary)
//
// index.html was already written entirely against the Supabase JS API
// (sb.from().select().eq()... , sb.storage.from(bucket).upload()...,
// sb.rpc(name, params)...) — the Firebase adapter was built to *mimic*
// that shape. So going back to Supabase needs no other code changes:
// just this file + the one import line in index.html.
//
// Storage buckets already referenced by index.html: 'avatars',
// 'college-ids', 'question-images'. In the Supabase dashboard, under
// Storage, make sure each of these exists and is set Public (so
// getPublicUrl() returns a URL that actually loads without auth).
// This is exactly "Option 2": files go into the bucket, only the
// resulting public URL (text) goes into the table's image_url /
// avatar_url / college_id_path columns — which is already how
// index.html is written (see replaceUserFile(), around line ~1079,
// and the question-image bulk upload around line ~3151).
//
// RPCs used by index.html (folder_rank_stats, set_rank_stats,
// set_rank_list_public, question_accuracy_stats, get_today_percentile,
// redeem_share_code, redeem_coupon, admin_list_users,
// admin_set_security_question, admin_set_rank_list,
// admin_subject_rank_list, admin_folder_rank_list,
// admin_examtype_rank_list, admin_overall_rank_list) are plain Postgres
// functions — sb.rpc() below calls them directly. These should already
// exist in this Supabase project if it's the same one the app used
// before the Firebase migration. If any come back with a "function
// does not exist" error, that function needs to be (re)created in the
// SQL editor.
// =====================================================================

// createClient comes from the global `supabase` object exposed by the
// jsdelivr UMD <script> tag loaded in index.html's <head> (see the comment
// there) — not an `import` from esm.sh. That UMD script is `defer`red and
// placed earlier in the document than this module, so document-order
// script execution guarantees it has already run and `window.supabase`
// already exists by the time this line runs.
const { createClient } = window.supabase;

const SUPABASE_URL = 'https://ewchwphfzdsbmbchensk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV3Y2h3cGhmemRzYm1iY2hlbnNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU0OTE1MjEsImV4cCI6MjEwMTA2NzUyMX0.Py3deWkFWCU1RZt1Xa6fIa59oG3tAX8s_pnPrOQUraE';

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Called from submitAttempt() in index.html right after an attempt is
// marked submitted, to keep each question's community accuracy counters
// (used by question_accuracy_stats) up to date incrementally.
// Requires a Postgres RPC `bump_question_stats(p_question_id, p_correct)`.
// If it doesn't already exist in this project, create it once via the
// SQL editor:
//
//   create or replace function bump_question_stats(p_question_id uuid, p_correct boolean)
//   returns void language sql as $$
//     insert into question_stats (question_id, total, correct)
//     values (p_question_id, 1, case when p_correct then 1 else 0 end)
//     on conflict (question_id) do update
//       set total   = question_stats.total + 1,
//           correct = question_stats.correct + (case when p_correct then 1 else 0 end);
//   $$;
//
// (Adjust p_question_id's type to match your questions.id column if it
// isn't a uuid.)
export async function bumpQuestionStats(pairs){
  // pairs: [{ questionId, wasCorrect }]
  await Promise.all(pairs.map(({ questionId, wasCorrect }) =>
    sb.rpc('bump_question_stats', { p_question_id: questionId, p_correct: !!wasCorrect })
  ));
}
