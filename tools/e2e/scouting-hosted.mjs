#!/usr/bin/env node
// Explicitly isolated hosted acceptance. Never use production or real identities.
// Config is a private, ignored JSON file: { project_ref, anon_key, publishable_key }.
// --seed emits SQL for review/execution in that empty branch, without sending email.
// --verify uses actual GoTrue-issued JWTs and actual hosted PostgREST/Edge requests.
import assert from 'node:assert/strict'
import { randomUUID, randomBytes } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync, chmodSync } from 'node:fs'
import { resolve } from 'node:path'

const configPath = resolve(process.env.SCOUTING_HOSTED_CONFIG || 'work/scouting-hosted.local.json')
const config = JSON.parse(readFileSync(configPath, 'utf8'))
chmodSync(configPath, 0o600)
const production = 'pbuogcrhdywpzvcxbwsd'
assert.match(config.project_ref, /^[a-z]{20}$/)
assert.notEqual(config.project_ref, production, 'Production is never an acceptance target')
assert.equal(config.isolated_without_data, true, 'Confirm a newly created data-free branch')
const origin = `https://${config.project_ref}.supabase.co`
const sqlText = value => "'" + String(value).replaceAll("'", "''") + "'"

if (process.argv.includes('--seed') || process.argv.includes('--emit-seed')) {
  assert.ok(!config.actors || process.argv.includes('--emit-seed'), 'A seed packet already exists; use --emit-seed to review it again')
  config.event ||= randomUUID()
  config.actors ||= Object.fromEntries(['admin', 'student', 'other', 'parent', 'parent_staff', 'unapproved'].map(role => [role, {
    id: randomUUID(), email: `${role}.${randomUUID()}@scouting.invalid`, password: randomBytes(32).toString('base64url'),
  }]))
  writeFileSync(configPath, JSON.stringify(config, null, 2), { mode: 0o600 })
  const users = Object.entries(config.actors).map(([role, actor]) => `(${sqlText(actor.id)},'00000000-0000-0000-0000-000000000000','authenticated','authenticated',${sqlText(actor.email)},extensions.crypt(${sqlText(actor.password)},extensions.gen_salt('bf')),now(),'','','','', '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now())`).join(',\n')
  const profiles = Object.entries(config.actors).map(([role, actor]) => `(${sqlText(actor.id)},${sqlText('Hosted fictional ' + role)},${role !== 'unapproved'},'active')`).join(',')
  const roles = Object.entries(config.actors).flatMap(([role, actor]) => (role === 'parent_staff' ? ['parent','mentor'] : [role === 'other' || role === 'unapproved' ? 'student' : role]).map(r => `(${sqlText(actor.id)},${sqlText(r)})`)).join(',')
  process.stdout.write(JSON.stringify({ query: `begin;
do $guard$ begin
 if exists(select 1 from auth.users) or exists(select 1 from public.profiles) or exists(select 1 from public.scouting_records) or exists(select 1 from cron.job) then
  raise exception 'Requires an empty isolated test branch with no jobs';
 end if;
end $guard$;
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,confirmation_token,recovery_token,email_change_token_new,email_change,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values ${users};
insert into auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at)
 select id::text,id,jsonb_build_object('sub',id::text,'email',email,'email_verified',true),'email',now(),now() from auth.users;
insert into public.profiles(id,full_name,approved,status) values ${profiles} on conflict(id) do update set approved=excluded.approved,status=excluded.status;
insert into public.member_roles(member_id,role) values ${roles} on conflict do nothing;
insert into public.events(id,title,kind,starts_at,ends_at) values(${sqlText(config.event)},'Scouting hosted fictional review','training',now(),now()+interval '1 day');
insert into public.connector_settings(id,enabled) values(true,false) on conflict(id) do nothing;
commit;` }))
  process.exit(0)
}

assert.ok(['--verify','--check-revoked','--check-restored'].some(flag=>process.argv.includes(flag)), 'Use --seed, --verify, --check-revoked or --check-restored')
assert.ok(config.actors && config.event, 'Prepare and execute the seed packet first')
assert.ok(Object.values(config.actors).every(actor => actor.email.endsWith('@scouting.invalid')), 'Only fictional identities are allowed')
const results = [], sessions = {}, out = resolve(process.env.SCOUTING_HOSTED_OUT || 'artifacts/scouting-hosted')
let completed = false
mkdirSync(out, { recursive: true })
const check = (label, actual) => { results.push({ label, ok: !!actual }); console.log(`${actual?'PASS':'FAIL'} hosted: ` + label); assert.ok(actual, label) }
const persistResults = () => {
  writeFileSync(resolve(out,'results.json'),JSON.stringify({project_ref:config.project_ref,event:config.event,verified_at:new Date().toISOString(),completed,scope:'Real hosted GoTrue password/refresh JWTs; SQL-provisioned fictional accounts, no OTP/OAuth or Discord delivery',results},null,2))
  console.log(`hosted HTTP: ${results.filter(r=>r.ok).length}/${results.length} passed; completed=${completed}`)
}
// curl preserves the session proxy and CA trust. Credentials go through stdin,
// never command-line arguments, logs, assertion messages or retained results.
function request(path, { method = 'GET', token, key = config.anon_key, body, headers = {} } = {}) {
  assert.ok(path.startsWith('/') && !path.startsWith('//'))
  const options = { url: origin + path, request: method, header: undefined }
  const lines = Object.entries(options).filter(([,v]) => v !== undefined).map(([k,v]) => `${k} = ${JSON.stringify(v)}`)
  for (const [k,v] of Object.entries({ apikey: key, ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json', ...headers })) lines.push(`header = ${JSON.stringify(k + ': ' + v)}`)
  if (body !== undefined) lines.push(`data = ${JSON.stringify(JSON.stringify(body))}`)
  const raw = execFileSync('curl', ['--config', '-', '--silent', '--show-error', '--max-time', '30', '--write-out', '\n%{http_code}'], { input: lines.join('\n'), encoding: 'utf8', maxBuffer: 8000000 })
  const split = raw.lastIndexOf('\n'), status = Number(raw.slice(split + 1)), text = raw.slice(0, split)
  let data; try { data = JSON.parse(text) } catch { data = text }
  return { status, data }
}
const rpc = (name, body, actor = 'student') => request('/rest/v1/rpc/' + name, { method: 'POST', token: sessions[actor].access_token, body })
if (process.argv.includes('--check-revoked') || process.argv.includes('--check-restored')) {
  // The operator changes ONLY the fictional other profile between these phases.
  // Reuse the SAME signed JWT to prove permissions do not depend on token refresh.
  const restored = process.argv.includes('--check-restored'), token = config.sessions.other.access_token
  try {
    const access = request('/rest/v1/rpc/scouting_can_access',{method:'POST',token,body:{}})
    check(`existing JWT access after ${restored?'restoration':'revocation'}`, access.status === 200 && access.data === restored)
    const read = request(`/rest/v1/scouting_records?event_id=eq.${config.event}&select=id`,{token})
    check(`existing JWT evidence after ${restored?'restoration':'revocation'}`,read.status===200 && Array.isArray(read.data) && (restored ? read.data.length>0 : read.data.length===0))
    const save = request('/rest/v1/rpc/scouting_save',{method:'POST',token,body:{p_id:randomUUID(),p_event:config.event,p_kind:'observation',p_team:5669,p_match:`qm${Date.now()}`,p_payload:{source:'live',answers:{trench:'no'}},p_expected_version:0,p_operation:randomUUID(),p_actor:config.actors.other.id}})
    check(`existing JWT save after ${restored?'restoration':'revocation'}`,restored ? save.status===200 && save.data.version===1 : save.status===403 && save.data.code==='42501')
    completed = true
  } finally { persistResults() }
  process.exit(0)
}
try {
  for (const [role, actor] of Object.entries(config.actors)) {
    const r = request('/auth/v1/token?grant_type=password', { method: 'POST', body: { email: actor.email, password: actor.password } })
    check(`real hosted password grant for fictional ${role}`, r.status === 200 && r.data.user?.id === actor.id && typeof r.data.access_token === 'string')
    sessions[role] = r.data
    const user = request('/auth/v1/user', { token: r.data.access_token })
    check(`GoTrue verifies ${role} token`, user.status === 200 && user.data.id === actor.id)
  }
  const refreshed = request('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: sessions.student.refresh_token } })
  check('real hosted session refresh', refreshed.status === 200 && refreshed.data.user?.id === config.actors.student.id)
  sessions.student = refreshed.data
  config.sessions = sessions
  writeFileSync(configPath, JSON.stringify(config,null,2),{mode:0o600})
  for (const [actor, expected] of [['admin',true],['student',true],['parent',false],['parent_staff',true],['unapproved',false]]) {
    const r = rpc('scouting_can_access', {}, actor)
    check(`${actor} access is ${expected}`, r.status === 200 && r.data === expected)
  }
  for (const [actor, expected] of [['admin',true],['student',false],['parent_staff',true],['parent',false]]) {
    const r = rpc('scouting_can_manage', { p_event: config.event }, actor)
    check(`${actor} manager boundary is ${expected}`, r.status === 200 && r.data === expected)
  }
  const id = randomUUID(), operation = randomUUID()
  const save = { p_id:id, p_event:config.event, p_kind:'observation', p_team:5669, p_match:`qm${Date.now()}`, p_payload:{source:'live',answers:{trench:'did_not_see',bump:'no'},notes:'Fictional hosted acceptance'},p_expected_version:0,p_operation:operation,p_actor:config.actors.student.id }
  const saved = rpc('scouting_save', save)
  check('student observation saved through hosted JWT/PostgREST', saved.status === 200 && saved.data.id === id && saved.data.version === 1)
  const retry = rpc('scouting_save', save)
  check('same operation returns original hosted receipt', retry.status === 200 && retry.data.id === id && retry.data.version === 1)
  const select = actor => request(`/rest/v1/scouting_records?id=eq.${id}&select=*`, {token:sessions[actor].access_token})
  const visible = select('other')
  check('another eligible scout reads confirmed distinct unknown and no', visible.status === 200 && visible.data.length === 1 && visible.data[0].payload.answers.trench === 'did_not_see' && visible.data[0].payload.answers.bump === 'no')
  for (const actor of ['parent','unapproved']) {
    const r = select(actor)
    check(`${actor} cannot read scouting evidence`, r.status === 200 && Array.isArray(r.data) && r.data.length === 0)
    const denied = rpc('scouting_save', {...save,p_id:randomUUID(),p_operation:randomUUID(),p_actor:config.actors[actor].id}, actor)
    check(`${actor} cannot save scouting evidence`, denied.status === 403 && denied.data.code === '42501')
  }
  const spoof = rpc('scouting_save', {...save,p_id:randomUUID(),p_operation:randomUUID(),p_actor:config.actors.other.id})
  check('hosted JWT actor cannot be spoofed', spoof.status === 403 && spoof.data.code === '42501')
  const otherEdit = rpc('scouting_save', {...save,p_operation:randomUUID(),p_expected_version:1,p_actor:config.actors.other.id},'other')
  check('another scout cannot correct author observation', otherEdit.status === 403 && otherEdit.data.code === '42501')
  const correction = rpc('scouting_save', {...save,p_operation:randomUUID(),p_expected_version:1,p_payload:{...save.p_payload,notes:'Reviewed fictional correction'}})
  check('author correction creates version two', correction.status === 200 && correction.data.version === 2)
  const stale = rpc('scouting_save', {...save,p_operation:randomUUID(),p_expected_version:1})
  check('stale hosted correction rejects explicit conflict', stale.status === 409 && stale.data.code === 'PT409')
  const duplicate = rpc('scouting_save', {...save,p_id:randomUUID(),p_operation:randomUUID()})
  check('new ID cannot duplicate the logical hosted observation', duplicate.status === 409 && duplicate.data.code === 'PT409')
  const missing = rpc('scouting_save', {...save,p_id:randomUUID(),p_operation:randomUUID(),p_expected_version:1})
  check('missing correction target returns explicit hosted conflict', missing.status === 409 && missing.data.code === 'PT409')
  const revisions = request(`/rest/v1/scouting_revisions?record_id=eq.${id}&select=*`,{token:sessions.student.access_token})
  check('hosted revision history retains two attributed versions', revisions.status === 200 && revisions.data.length === 2 && revisions.data.every(r=>r.changed_by===config.actors.student.id))
  const direct = request('/rest/v1/scouting_records',{method:'POST',token:sessions.student.access_token,body:{id:randomUUID(),event_id:config.event,kind:'observation',team_number:5669,member_id:config.actors.student.id,payload:{}}})
  check('direct hosted table write refused', direct.status === 403 && direct.data.code === '42501')
  const receipts = request('/rest/v1/scouting_operations?select=*',{token:sessions.student.access_token})
  check('private receipt table cannot be read directly', receipts.status === 403 && receipts.data.code === '42501')
  const privateSchema = request('/rest/v1/rpc/can_access',{method:'POST',token:sessions.student.access_token,headers:{'Content-Profile':'scouting_private'},body:{p_member:config.actors.student.id}})
  check('private scouting schema is outside exposed Data API schemas', privateSchema.status === 406 && privateSchema.data.code === 'PGRST106')
  const anonymous = request('/rest/v1/rpc/scouting_can_access',{method:'POST',body:{}})
  check('anonymous caller cannot execute scouting RPC', anonymous.status === 401)
  if (config.publishable_key) {
    const modern = request('/rest/v1/rpc/scouting_can_access',{method:'POST',key:config.publishable_key,token:sessions.student.access_token,body:{}})
    check('modern publishable key supports authenticated Data API', modern.status === 200 && modern.data === true)
  }
  const rosterAdmin = rpc('scouting_roster',{p_event:config.event},'admin'), rosterStudent = rpc('scouting_roster',{p_event:config.event})
  check('manager can read eligible scouting roster', rosterAdmin.status === 200 && Array.isArray(rosterAdmin.data) && rosterAdmin.data.some(r=>r.id===config.actors.student.id))
  check('ordinary scout cannot read manager roster', rosterStudent.status === 403 && rosterStudent.data.code === '42501')
  // Import only reads providers. Dispatch probes below never supply a record ID.
  for (const fn of ['scouting-import','scouting-dispatch']) {
    const invalid = request('/functions/v1/'+fn,{method:'POST',token:'invalid-jwt',body:{}})
    check(`${fn} gateway rejects invalid JWT`, invalid.status === 401)
  }
  const imported = request('/functions/v1/scouting-import',{method:'POST',token:sessions.admin.access_token,body:{event_id:config.event,event_key:'2026dal'}})
  check('deployed import accepts real manager JWT', imported.status === 200 && Array.isArray(imported.data.sources))
  const deniedImport = request('/functions/v1/scouting-import',{method:'POST',token:sessions.student.access_token,body:{event_id:config.event,event_key:'2026dal'}})
  check('deployed import denies ordinary scout roster access', deniedImport.status === 403)
  const map = request('/functions/v1/scouting-import',{method:'POST',token:sessions.student.access_token,body:{event_id:config.event,event_key:'2026dal',mode:'pit_map'}})
  check('eligible scout reaches deployed map configuration boundary', (map.status === 503 && map.data.status === 'not_configured') || (map.status === 200 && map.data.map))
  const dispatched = request('/functions/v1/scouting-dispatch',{method:'POST',token:sessions.student.access_token,body:{}})
  check('deployed dispatch rejects missing record without sending', dispatched.status === 400)
  config.sessions = sessions
  writeFileSync(configPath, JSON.stringify(config,null,2),{mode:0o600})
  completed = true
} finally {
  persistResults()
}
