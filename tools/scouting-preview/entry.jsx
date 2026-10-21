// Review-only entry point. Bundles the ACTUAL scouting route with the existing
// fictional fixture backend. Never imported by the production application.
import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import ScoutingPage from '../../src/ScoutingPage.jsx'
import { fixture, supabase } from '../../src/dev/fixture/client.js'
import { IDS } from '../../src/dev/fixture/personas.js'
import '../../src/theme.css'
import '../../src/App.css'
import '../../src/plate.css'
import { APP_PLATE } from '../../src/plate.js'
import './review.css'

if (APP_PLATE) document.documentElement.classList.add(APP_PLATE)
fixture.setMigrations('all'); fixture.setLatency(15)
function Review() {
  const [persona,setPersona]=useState('student'), [session,setSession]=useState(null), [key,setKey]=useState(0)
  async function choose(next) {
    fixture.setPersona(next)
    const {data}=await supabase.auth.getSession()
    setPersona(next);setSession(data.session);setKey(n=>n+1)
  }
  React.useEffect(()=>{choose('student')},[])
  const roles=fixture.rows('member_roles').filter(r=>r.member_id===IDS[persona]).map(r=>r.role)
  return <>
    <header className="review-bar"><div><strong>TECHMEN · SCOUTING REVIEW</strong><p>Fictional demo data · no live database or Discord · changes stay in this browser.</p></div><label>Review as<select value={persona} onChange={e=>choose(e.target.value)}><option value="student">Student scout</option><option value="mentor">Mentor / scouting lead</option><option value="parent">Parent (access denied)</option></select></label></header>
    <details className="review-guide"><summary>Try the scouting workflows</summary><ol><li>Scout This: open an assigned robot, record an observation and inspect its saved status.</li><li>Teams: compare pit claims with match evidence.</li><li>Pit messages: reply to the repair question. No real notification will be sent.</li><li>Pick lists: move teams between tiers, then preview a three-team comparison.</li><li>Practice: sort evidence, run six fictional match scenarios and save a footage workbook.</li><li>Switch to Mentor: expand Manage event, paste a schedule and preview a scouting shift.</li></ol><p>This file uses the application’s actual React components with a simulated backend. It is for review, not live competition use. Browser storage must be available. Open the file in Chrome or Edge if your file viewer blocks scripts.</p></details>
    {session&&<MemoryRouter key={key} initialEntries={['/scouting/16000000-0000-4000-8000-000000000001']}><Routes><Route path="/scouting/:eventId" element={<ScoutingPage session={session} hasRole={r=>roles.includes(r)}/>}/><Route path="*" element={<ScoutingPage session={session} hasRole={r=>roles.includes(r)}/>}/></Routes></MemoryRouter>}
  </>
}
createRoot(document.getElementById('root')).render(<Review/> )
