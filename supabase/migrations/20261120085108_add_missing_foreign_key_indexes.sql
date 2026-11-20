-- Add B-tree indexes for foreign-key columns identified by Supabase's
-- unindexed_foreign_keys advisor. This is additive and preserves all rows.
create index if not exists idx_admin_audit_logs_admin_id on public.admin_audit_logs (admin_id);
create index if not exists idx_conversation_members_user_id on public.conversation_members (user_id);
create index if not exists idx_conversations_created_by on public.conversations (created_by);
create index if not exists idx_conversations_project_id on public.conversations (project_id);
create index if not exists idx_meetings_attendee_id on public.meetings (attendee_id);
create index if not exists idx_meetings_organizer_id on public.meetings (organizer_id);
create index if not exists idx_meetings_project_id on public.meetings (project_id);
create index if not exists idx_messages_sender_id on public.messages (sender_id);
create index if not exists idx_notifications_actor_id on public.notifications (actor_id);
create index if not exists idx_notifications_application_id on public.notifications (application_id);
create index if not exists idx_notifications_conversation_id on public.notifications (conversation_id);
create index if not exists idx_notifications_project_id on public.notifications (project_id);
create index if not exists idx_payment_records_payee_id on public.payment_records (payee_id);
create index if not exists idx_payment_records_payer_id on public.payment_records (payer_id);
create index if not exists idx_payment_records_project_id on public.payment_records (project_id);
create index if not exists idx_profile_blocks_blocked_id on public.profile_blocks (blocked_id);
create index if not exists idx_project_deliverables_project_id on public.project_deliverables (project_id);
create index if not exists idx_saved_projects_project_id on public.saved_projects (project_id);
create index if not exists idx_support_requests_user_id on public.support_requests (user_id);
