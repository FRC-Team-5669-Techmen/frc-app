// The app's one notion of "current season", extracted so the application gate,
// the staff applications view, and anything else added later all agree.
//
// The season row whose [start_date, end_date] window contains today. "Today"
// is the America/Los_Angeles calendar date (laDateKey, the one day rule every
// hours view uses), compared as a 'YYYY-MM-DD' string, the form the seasons
// columns are stored in. It used to be the UTC date, which turned the season
// over at 4 PM PST on a season's last day: the application gate would then ask
// for next season's form and Team Hours would open on a season that had not
// started. `today` is a parameter so the rule is testable.
import { laDateKey } from './hoursUtils'

export function resolveCurrentSeason(seasons, today = laDateKey(Date.now())) {
  if (!seasons?.length) return null
  return seasons.find(s => s.start_date <= today && (s.end_date == null || s.end_date >= today)) ?? null
}
