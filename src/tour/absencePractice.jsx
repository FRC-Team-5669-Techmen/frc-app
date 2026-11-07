import { AbsenceForm } from '../StandingPage.jsx'
// The production fields and validator, with a local submit callback. No RPC.
export default function AbsencePractice({ onDone }) {
  const start = new Date(Date.now() + 7 * 86400000).toISOString()
  return (
    <div data-tour="absence-practice">
      <AbsenceForm
        practice
        events={[
          {
            id: 'practice-meeting',
            title: 'Sample team meeting',
            kind: 'meeting',
            starts_at: start,
            ends_at: new Date(Date.parse(start) + 3600000).toISOString(),
          },
        ]}
        absences={[]}
        onDone={onDone}
      />
    </div>
  )
}
