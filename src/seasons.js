// The app's one notion of "current season", extracted so the application gate,
// the staff applications view, and anything else added later all agree.
//
// This is the rule HoursBoard.jsx already used inline: the season row whose
// [start_date, end_date] window contains today (UTC date string, the same form
// the seasons columns are stored in). Nothing new is invented here.
export function resolveCurrentSeason(seasons) {
  if (!seasons?.length) return null
  const today = new Date().toISOString().slice(0, 10)
  return seasons.find(s => s.start_date <= today && (s.end_date == null || s.end_date >= today)) ?? null
}
