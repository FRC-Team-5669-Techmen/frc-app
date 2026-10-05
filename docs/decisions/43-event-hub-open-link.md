# 43 How do families reach the event hub: emailed per-family links, or one open link?
- Raised: 2026-10-05 by the event family hub session (ledger 0003), when the emailed-link flow could not be tested and left out families with no email on file
- Status: decided
- Decided: 2026-10-05, Mr. Pina: **one open link per event, option B.** "Anybody who receives a link may fill this out. Whoever's filling this out must be a parent or guardian ... they have to specify which student they're filling it out for. This student would have had to fill out the application form." It runs on integrity, like the team's Google Forms. Option B, with "functionality to have multiple parents involved for one student".

## What that means in the tree (0007)

- `/join/<event id>` lists the students with this season's application. The
  person picks one, gives a name and email, and ticks "I am this student's
  parent or guardian".
- **Nobody has started for that student**: straight into the family page.
- **A family has started** (a link was sent or handed over, or answers were
  saved): the page is not opened. The link is emailed to the addresses already
  on that family, naming who asked, and the screen shows those addresses
  masked. This is option B's whole point: picking a name never shows another
  family's answers.
- **More than one parent**: "Add another parent or guardian" on the family
  page sends that person their own link to the same page; mentors can still
  edit a family's emails on the mentor page.

## Option A, not taken

Anyone with the open link opens any listed student's page, including what the
family already entered (pickup address, emergency contact, medication,
allergies). Refused by the session's safety check before Mr. Pina chose B.

## What is still open

Whether a student may fill it in for a parent. Today the tick says parent or
guardian; a student who ticks it anyway is on the integrity system like
everyone else.
