// Read-only upstream adapter. Saving the preview uses scouting_save, under
// the same author, conflict and audit rules as manual team entry.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EVENT = /^20\d{2}[a-z0-9_]{2,60}$/
const TEAM = /^frc([1-9]\d{0,4})$/
const number = value => Number.isInteger(value) && value > 0 && value <= 99999
const text = (value, max = 200) => typeof value === 'string' ? value.slice(0, max) : ''

async function fetchJson(url, headers, fetchImpl) {
  const response = await fetchImpl(url, { headers, redirect: 'error', signal: AbortSignal.timeout(10000) })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  if (Number(response.headers?.get('content-length')) > 4000000) throw new Error('Response is too large')
  const reader = response.body?.getReader()
  if (!reader) throw new Error('Empty response')
  let bytes = 0
  const chunks = []
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    bytes += value.byteLength
    if (bytes > 4000000) { await reader.cancel(); throw new Error('Response is too large') }
    chunks.push(value)
  }
  const joined = new Uint8Array(bytes)
  let at = 0
  for (const chunk of chunks) { joined.set(chunk, at); at += chunk.byteLength }
  return { data: JSON.parse(new TextDecoder().decode(joined)), cache_control: response.headers?.get('cache-control'), etag: response.headers?.get('etag') }
}

export function normalizeMatches(raw) {
  if (!Array.isArray(raw)) throw new Error('Unexpected match response')
  if (raw.length > 1000) throw new Error('Match response exceeds the supported event size')
  if (raw.some(match => typeof match?.key !== 'string' || match.key.length > 100 || !match.alliances
    || ['red', 'blue'].some(color => !Array.isArray(match.alliances[color]?.team_keys)
      || match.alliances[color].team_keys.some(key => typeof key !== 'string' || !TEAM.test(key))))) {
    throw new Error('Unexpected match schema')
  }
  return raw.slice(0, 1000).flatMap(match => {
    if (typeof match?.key !== 'string' || match.key.length > 100 || !match.alliances) return []
    const alliances = {}
    for (const color of ['red', 'blue']) {
      const alliance = match.alliances[color]
      alliances[color] = {
        teams: (Array.isArray(alliance?.team_keys) ? alliance.team_keys : []).flatMap(k => TEAM.test(k) ? [Number(TEAM.exec(k)[1])] : []),
        score: Number.isFinite(alliance?.score) && alliance.score >= 0 ? alliance.score : null,
        // Source-provided breakdown remains alliance data. Never divided by 3.
        score_breakdown: match.score_breakdown?.[color] ?? null,
      }
    }
    return [{ key: match.key, teams: [...alliances.red.teams, ...alliances.blue.teams], alliances,
      videos: (Array.isArray(match.videos) ? match.videos : []).flatMap(v => v.type === 'youtube' && /^[\w-]{11}$/.test(v.key) ? [`https://www.youtube.com/watch?v=${v.key}`] : []),
      time: Number.isFinite(match.actual_time ?? match.predicted_time ?? match.time) ? (match.actual_time ?? match.predicted_time ?? match.time) : null,
    }]
  })
}

export function normalizeTeamPreview({ teams, matches = [], pits = {}, estimates = [], fetchedAt, eventKey }) {
  if (!Array.isArray(teams)) throw new Error('Unexpected team response')
  const estimateMap = new Map((Array.isArray(estimates) ? estimates : []).filter(x => number(x?.team) && x?.event === eventKey).map(x => [x.team, x]))
  const seen = new Set()
  return teams.slice(0, 500).flatMap(team => {
    if (!number(team?.team_number) || seen.has(team.team_number)) return []
    seen.add(team.team_number)
    const estimate = estimateMap.get(team.team_number)
    const epa = estimate?.epa?.total_points
    return [{ team_number: team.team_number, payload: {
      name: text(team.nickname || team.name) || `Team ${team.team_number}`, pit_location: text(pits[String(team.team_number)], 80),
      source: 'tba', source_url: `https://www.thebluealliance.com/event/${eventKey}`, fetched_at: fetchedAt,
      epa: typeof epa === 'number' && Number.isFinite(epa) ? epa : null,
      epa_source: 'statbotics', epa_fetched_at: typeof epa === 'number' && Number.isFinite(epa) ? fetchedAt : null,
      official_results: matches.flatMap(match => ['red', 'blue'].flatMap(color => match.alliances[color].teams.includes(team.team_number)
        ? [{ match_key: match.key, alliance: color, alliance_score: match.alliances[color].score, score_breakdown: match.alliances[color].score_breakdown, source: 'tba', fetched_at: fetchedAt }]
        : [])),
    } }]
  })
}

export async function importScouting({ userClient, body, env = {}, fetchImpl = fetch, now = () => new Date().toISOString() }) {
  if (!UUID.test(body?.event_id ?? '') || !EVENT.test(body?.event_key ?? '')) return { http: 400, error: 'Choose a calendar event and a valid provider event key, such as 2026dal.' }
  const auth = await userClient.auth.getUser()
  if (auth.error || !auth.data?.user) return { http: 401, error: 'Sign in first.' }
  const allowed = await userClient.rpc('scouting_can_manage', { p_event: body.event_id })
  if (allowed.error || allowed.data !== true) return { http: 403, error: 'Only a scouting manager can prepare imported event data.' }
  const eventKey = body.event_key
  const fetchedAt = now()
  const sources = []
  const get = async (source, url, headers, configured = true) => {
    if (!configured) { sources.push({ source, status: 'not_configured', message: 'Server API credential is not configured.', fetched_at: null }); return null }
    try {
      const result = await fetchJson(url, headers, fetchImpl)
      sources.push({ source, status: 'ok', fetched_at: fetchedAt, source_url: url, cache_control: result.cache_control, etag: result.etag })
      return result.data
    } catch {
      sources.push({ source, status: 'unavailable', message: 'Source unavailable or invalid. Existing saved data is unchanged.', fetched_at: null })
      return null
    }
  }
  const [rawTeams, rawMatches, rawPits, estimates] = await Promise.all([
    get('tba_teams', `https://www.thebluealliance.com/api/v3/event/${eventKey}/teams/simple`, { 'X-TBA-Auth-Key': env.TBA_AUTH_KEY ?? '' }, !!env.TBA_AUTH_KEY),
    get('tba_matches', `https://www.thebluealliance.com/api/v3/event/${eventKey}/matches`, { 'X-TBA-Auth-Key': env.TBA_AUTH_KEY ?? '' }, !!env.TBA_AUTH_KEY),
    get('nexus_pits', `https://frc.nexus/api/v1/event/${eventKey}/pits`, { 'Nexus-Api-Key': env.NEXUS_API_KEY ?? '' }, !!env.NEXUS_API_KEY),
    get('statbotics', `https://api.statbotics.io/v3/team_events?event=${eventKey}&limit=1000`, {}),
  ])
  const invalid = source => { const row = sources.find(s => s.source === source); if (row) { row.status = 'invalid'; row.message = 'Provider schema did not match the pinned adapter. Existing data is unchanged.' } }
  let matches = []
  if (rawMatches !== null) { try { matches = normalizeMatches(rawMatches) } catch { invalid('tba_matches') } }
  if (rawTeams !== null && (!Array.isArray(rawTeams) || rawTeams.length > 500 || rawTeams.some(team => !number(team?.team_number)))) invalid('tba_teams')
  const pits = rawPits && typeof rawPits === 'object' && !Array.isArray(rawPits) ? rawPits : {}
  if (rawPits !== null && (Array.isArray(rawPits) || typeof rawPits !== 'object')) invalid('nexus_pits')
  if (estimates !== null && (!Array.isArray(estimates) || estimates.some(e => e?.epa?.total_points != null && !Number.isFinite(e.epa.total_points)))) invalid('statbotics')
  const teamsValid = sources.find(s => s.source === 'tba_teams')?.status === 'ok'
  const teams = normalizeTeamPreview({ teams: teamsValid ? rawTeams : [], matches, pits, estimates, fetchedAt, eventKey })
  // Failed sources must never erase a previously cached field when the user
  // merges this preview with an existing record. Absence differs from zero.
  const ok = source => sources.find(s => s.source === source)?.status === 'ok'
  for (const team of teams) {
    if (!ok('nexus_pits') || !team.payload.pit_location) delete team.payload.pit_location
    else { team.payload.pit_source = 'nexus'; team.payload.pit_fetched_at = fetchedAt }
    if (!ok('statbotics') || team.payload.epa === null) {
      delete team.payload.epa; delete team.payload.epa_source; delete team.payload.epa_fetched_at
    }
    if (!ok('tba_matches')) delete team.payload.official_results
  }
  return { http: 200, teams, matches, sources, fetched_at: fetchedAt, event_key: eventKey,
    message: 'Preview only. No scouting data was changed. Review source timestamps before saving.' }
}
