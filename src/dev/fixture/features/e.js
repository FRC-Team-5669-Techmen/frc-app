// Fixture for /announce (Discord announcements), migration 0003.
//
// Seeds the role list and the announcement log so the page can be driven in
// both states: with 0003 applied (a role list to pick from, a log with one
// row in each terminal state) and with it not applied (both tables answer
// PGRST205, so the page shows its plain "Not set up yet" card).
//
// Every Discord id here is FICTIONAL -- the shape of a real one, nobody's real
// role. The real list is typed in by an admin from Discord itself.
//
// The Edge Function is not part of the fixture contract, so in fixture mode
// supabase.functions has nothing behind it and the page reports the announce
// function as not deployed: compose and preview work, Send stays off.
//
// No imports and no side effects, per src/dev/fixture/README.md.

const ROLE_ROWS = [
  ['Mechanical', '100000000000000001', 10, null, true],
  ['Electrical', '100000000000000002', 20, null, true],
  ['Programming', '100000000000000003', 30, null, true],
  ['CAD', '100000000000000004', 40, null, true],
  ['Business/Media', '100000000000000005', 50, null, true],
  ['Scouting', '100000000000000006', 60, null, true],
  ['Drive Team', '100000000000000007', 70, null, true],
  ['Student', '100000000000000011', 90, 'Not mentionable in Discord; kept off on purpose.', false],
]

function clockMs(now) {
  if (now instanceof Date) return now.getTime()
  if (typeof now === 'number') return now
  if (typeof now === 'string' && !Number.isNaN(Date.parse(now))) return Date.parse(now)
  return Date.parse('2026-10-01T17:00:00Z')
}

export default {
  migration: '0003',
  creates: {
    tables: ['discord_announce_roles', 'discord_announcements'],
    rpcs: [],
    columns: {},
  },

  seed: ({ ids, now }) => {
    const t = clockMs(now)
    const ago = minutes => new Date(t - minutes * 60_000).toISOString()
    const admin = ids?.admin ?? null

    return {
      discord_announce_roles: ROLE_ROWS.map(([name, role_id, sort_order, notes, active], i) => ({
        id: `fx-dar-${i + 1}`,
        name,
        role_id,
        active,
        sort_order,
        notes,
        created_by: admin,
        created_at: ago(60 * 24 * 7),
        updated_at: ago(60 * 24 * 7),
      })),

      discord_announcements: [
        {
          id: 'fx-da-1',
          request_id: '00000000-0000-4000-8000-00000000e001',
          sent_by: admin,
          sender_name: 'Ada',
          channel_name: 'announcements',
          channel_id: '100000000000000100',
          content: '<@&100000000000000001> <@&100000000000000002>\nSHOP HOURS THIS WEEK\n\nTuesday 3:15 to 6:00\nThursday 3:15 to 6:00',
          role_ids: ['100000000000000001', '100000000000000002'],
          role_names: ['Mechanical', 'Electrical'],
          embed: null,
          poll: null,
          payload: { content: 'SHOP HOURS THIS WEEK', allowed_mentions: { parse: [], roles: ['100000000000000001', '100000000000000002'] } },
          status: 'sent',
          discord_message_id: '100000000000009001',
          error: null,
          created_at: ago(60 * 26),
          sent_at: ago(60 * 26),
        },
        {
          id: 'fx-da-2',
          request_id: '00000000-0000-4000-8000-00000000e002',
          sent_by: admin,
          sender_name: 'Ada',
          channel_name: 'parents',
          channel_id: '100000000000000101',
          content: '',
          role_ids: [],
          role_names: [],
          embed: null,
          poll: { question: { text: 'Can you drive to the October competition?' }, answers: [{ poll_media: { text: 'Yes' } }, { poll_media: { text: 'No' } }], duration: 72, allow_multiselect: false, layout_type: 1 },
          payload: { poll: { question: { text: 'Can you drive to the October competition?' } }, allowed_mentions: { parse: [], roles: [] } },
          status: 'failed',
          discord_message_id: null,
          error: 'The bot is missing a permission in #parents. It needs View Channel and Send Messages, plus Embed Links for an embed and Send Polls for a poll.',
          created_at: ago(60 * 3),
          sent_at: null,
        },
        {
          id: 'fx-da-3',
          request_id: '00000000-0000-4000-8000-00000000e003',
          sent_by: admin,
          sender_name: 'Ada',
          channel_name: 'announcements',
          channel_id: '100000000000000100',
          content: '<@&100000000000000003>\nCode review moved to Thursday.',
          role_ids: ['100000000000000003'],
          role_names: ['Programming'],
          embed: null,
          poll: null,
          payload: { content: 'Code review moved to Thursday.', allowed_mentions: { parse: [], roles: ['100000000000000003'] } },
          status: 'unknown',
          discord_message_id: null,
          error: 'No answer from Discord (socket hang up).',
          created_at: ago(30),
          sent_at: null,
        },
      ],
    }
  },

  rpcs: {},
  relations: {},

  // Both tables are staff-read under migration 0003's RLS. The page itself is
  // admin-only, but a mentor reading the tables directly sees them.
  visible: {
    discord_announce_roles: ({ persona }) => !!persona?.isStaff,
    discord_announcements: ({ persona }) => !!persona?.isStaff,
  },
}
