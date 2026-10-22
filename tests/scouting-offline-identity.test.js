import { describe, it, expect, vi } from 'vitest'
import { readOfflineScoutingAccount, prepareOfflineScoutingAccount, clearOfflineScoutingAccountUnless, storedSessionMemberId } from '../src/scouting/offlineIdentity.js'
const member='10000000-0000-4000-8000-000000000001', event='20000000-0000-4000-8000-000000000001'
function memory(){const data=new Map();return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k),data}}
describe('prepared scouting device identity',()=>{
 it('uses the stored session identity even when expired, never the last prepared account as a login',()=>{
  const s=memory();const key='test-auth-session'
  prepareOfflineScoutingAccount(member,event,s)
  expect(storedSessionMemberId(key,s)).toBeNull()
  s.setItem(key,JSON.stringify({user:{id:member},expires_at:1,access_token:'synthetic-not-a-real-token'}))
  expect(storedSessionMemberId(key,s)).toBe(member)
  s.setItem(key,JSON.stringify({user:{id:event},expires_at:1}))
  expect(storedSessionMemberId(key,s)).not.toBe(readOfflineScoutingAccount(s).memberId)
  s.setItem(key,'broken');expect(storedSessionMemberId(key,s)).toBeNull()
 })
 it('retains a local hint with no credentials and clears it on account switch or sign-out',()=>{
  const s=memory();expect(readOfflineScoutingAccount(s)).toBeNull()
  expect(prepareOfflineScoutingAccount(member,event,s)).toBe(true)
  expect(readOfflineScoutingAccount(s)).toMatchObject({memberId:member,eventId:event})
  expect(Object.keys(JSON.parse([...s.data.values()][0])).sort()).toEqual(['eventId','memberId','preparedAt'])
  clearOfflineScoutingAccountUnless(member,s);expect(readOfflineScoutingAccount(s)?.memberId).toBe(member)
  clearOfflineScoutingAccountUnless('30000000-0000-4000-8000-000000000001',s);expect(readOfflineScoutingAccount(s)).toBeNull()
  prepareOfflineScoutingAccount(member,event,s);clearOfflineScoutingAccountUnless(null,s);expect(readOfflineScoutingAccount(s)).toBeNull()
 })
 it('refuses malformed hints and reports blocked storage without pretending preparation succeeded',()=>{
  const s=memory();prepareOfflineScoutingAccount(member,event,s);expect(readOfflineScoutingAccount(s)).not.toBeNull()
  const key=[...s.data.keys()][0]
  for(const bad of ['{',JSON.stringify({memberId:'------------------------------------',preparedAt:1}),JSON.stringify({memberId:member,preparedAt:'yesterday'}),JSON.stringify({memberId:member,eventId:'other',preparedAt:1})]){s.setItem(key,bad);expect(readOfflineScoutingAccount(s)).toBeNull()}
  const blocked={getItem:()=>{throw Error('blocked')},setItem:()=>{throw Error('quota')},removeItem:vi.fn()}
  expect(prepareOfflineScoutingAccount(member,event,blocked)).toBe(false);expect(readOfflineScoutingAccount(blocked)).toBeNull()
 })
})
