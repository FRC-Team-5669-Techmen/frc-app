import { describe, it, expect, vi } from 'vitest'
import { readOfflineScoutingAccount, prepareOfflineScoutingAccount, clearOfflineScoutingAccountUnless } from '../src/scouting/offlineIdentity.js'
const member='10000000-0000-4000-8000-000000000001', event='20000000-0000-4000-8000-000000000001'
function memory(){const data=new Map();return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k),data}}
describe('prepared scouting device identity',()=>{
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
