// Every member_applications column a CLIENT may read — which is all of them
// except parent_token.
//
// `select('*')` is not usable on this table any more. Postgres expands the star
// and checks privileges on each expanded column, and parent_token is revoked
// from authenticated at the column level (supabase/parent_responses.sql), so a
// star select errors with "permission denied for column parent_token". The
// token is the capability key for the parent questionnaire: a student able to
// read their own would answer the form as their own parent.
//
// KEEP IN SYNC: a column added to member_applications must be added here (and
// supabase/parent_responses.sql re-run, so the new column gets a grant at all).
export const APPLICATION_SELECT = [
  'id', 'member_id', 'season_id', 'submitted_at',
  'legal_first_name', 'legal_last_name', 'student_phone',
  'pathway', 'returning_member', 'seasons_on_team',
  'prior_robotics', 'programming_languages', 'cad_tools', 'hands_on_experience',
  'certifications_claimed',
  'subteam_first', 'subteam_second', 'subteam_third', 'subteam_rationale',
  'monday_lunch', 'tuesday_after_school', 'friday_after_school',
  'transport_after_5pm', 'seasonal_conflicts', 'conflict_detail',
  'build_season_acknowledged', 'fll_volunteering_interest',
  'parent_name', 'parent_email', 'parent_phone',
  'parent_two_name', 'parent_two_contact',
  'dietary_restrictions', 'emergency_contact_name', 'emergency_contact_phone',
  'discord_username', 'discord_server_confirmed',
  'conduct_acknowledged',
].join(', ')
