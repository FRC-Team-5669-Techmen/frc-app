// Subteam vocabulary — the single source of truth for the team's subteams.
// Previously duplicated (and drifted) across ProfilePage, JobsPage, and the
// member application; every consumer now imports from here.
//
// IMPORTANT: these strings ARE the data. profiles.subteams (text[]) stores the
// literal values below, and member_applications.subteam_first/second/third are
// CHECK-pinned to them (supabase/subteams_vocabulary.sql). Renaming, recasing,
// or repunctuating an existing entry silently orphans live rows with no error.
// Add new values at the end; never edit one in place without a data migration.
//
// Kept dependency-free (no React, no Supabase) so any route can import it.
export const SUBTEAMS = [
  'Mechanical',
  'Electrical',
  'Programming',
  'CAD',
  'Fabrication',
  'Media',
  'Business/Outreach',
  'Drive Team',
  'Robot Construction',
  'Field & Pit',
  'Strategy and Scouting',
  'Management',
]

// Case-insensitive membership test. Consumers that group or sort by subteam do
// so from the data itself (A→Z), so an unknown/legacy value still renders --
// this is for the places that want to know whether a value is canonical.
const CANON = new Set(SUBTEAMS.map(s => s.toLowerCase()))
export const isSubteam = s => typeof s === 'string' && CANON.has(s.toLowerCase())
