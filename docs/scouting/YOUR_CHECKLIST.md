# Your remaining tasks — no coding required

This is the human checklist. The AI keeps responsibility for programming, database setup, test infrastructure, automated verification, fixes, GitHub, packaging and technical release work. You do not need to run terminal commands, paste SQL, or interpret test logs.

The current application is a review candidate, not an installed production release. Do not start these phone exercises on the normal team site yet. First the AI must give you a working, separate test link, the correct test event, sign-in instructions and a build identifier. A fictional offline review file is useful for looking around, but cannot establish hosted login or synchronization.

## 1. Do now: unblock the test workspace's Internet access

**What is blocked:** this ChatGPT execution environment permits package-download sites but not the Supabase application endpoint. A fresh read-only connection attempt on October 21, 2026 received a proxy CONNECT 403 before reaching Supabase. This is a workspace access setting, not evidence that your Supabase password is wrong.

1. Open the settings for the cloud execution environment attached to this conversation. Look for Internet or network access. This is not your phone's Wi-Fi setting, Vercel Firewall, or Supabase's SQL editor.
2. Allow the environment to reach the web services needed for testing, keeping existing GitHub/package access. The AI needs HTTPS to the isolated Supabase test project's hostname and to `www.thebluealliance.com`, `api.statbotics.io` and `frc.nexus`. If the settings only accept individual domains, have the AI supply the new test project's exact hostname first; the old temporary project was deleted and must not be reused. Source-video review also needs approved access to its original sites and media hosts, which can be identified separately.
3. Save/apply the environment configuration and allow any requested environment refresh. Tell the AI: **“The environment network setting is updated. Recheck access and prepare the test link.”**

The AI cannot see your settings screen, so exact button names are not verified. **If you cannot find this setting, send a screenshot of the conversation's environment/settings controls. Do not include passwords or secret keys.** The AI can then identify the next click. No available tool currently edits this workspace's policy; the similarly named Vercel network tool controls a different product.

**Done when:** the AI reports that the actual test endpoint is reachable. A saved setting alone is not proof. Network permission does not authorize production changes or Discord sends.

## 2. Let the AI prepare the test system

This part belongs to the AI. It should prepare an isolated database and app, verify hosted login/API behavior and permissions, inspect provider responses, arrange fictional training data, and supply a tested URL. It must preserve production. If creating a test resource needs a paid-service approval, it must show the actual quoted cost before you approve it; do not authorize an unspecified bill.

Your involvement is conditional:

| If this occurs | Your action | What the AI handles |
| --- | --- | --- |
| A service asks you to sign in or approve account access | Sign in yourself using the intended Team 5669 account. Keep passwords and login codes private | Continue configuration after access is available |
| A provider key is genuinely missing or inaccessible | Follow the specific provider-account instructions the AI supplies, then enter the key only into the identified secure secret field | Check existing configuration first; configure and verify the integration. Do not make you regenerate keys unnecessarily |
| Test infrastructure asks for a cost decision | Approve or reject the quoted amount and duration | Setup, verification, evidence retention and cleanup |

Do not create another GitHub repository, Supabase production project or Vercel production deployment. No technical setup is delegated to you merely because a dashboard button exists.

## 3. Gather the people and devices

Once the working test link is ready, gather:

- One real iPhone using Safari and one real Android phone using Chrome. Use the phones scouts expect to use, charged and with available storage. Avoid private/incognito browsing.
- At least one beginner scout, a second person for paired exercises, a mentor who understands REBUILT, and the drive coach for the strategy review. One person may fill multiple adult roles.
- Reliable Wi-Fi initially, a stopwatch or clock, and somewhere to write results. Three hours is the planned training activity budget, not a proven completion time or passing score.

Use the accounts and event identified for the isolated test. Do not borrow another student's password. A beginner should try the first task before being coached; record help when it is needed. Stop and report a failure rather than quietly working around it and calling it a pass.

## 4. Run the phone session with the AI

The AI supplies the exact event/team/match and checks database records afterward. You supply physical phone actions and what a human actually sees. Do not clear browser data or uninstall the app while unsynchronized work exists.

### A. First observation and understanding (P01–P02)

1. Open the test link, sign in, open **Scouting**, and open the assigned test event.
2. Start timing. Have the beginner find the assigned robot/match under **Scout this**, then choose **Scout match**.
3. Using the mentor's prepared recording, record a visible unsuccessful attempt as **No** and a blocked view as **Did not see**. Do not guess or convert uncertainty to zero.
4. Tap **Save observation**. Record the elapsed time, mistakes, questions and assistance.
5. Ask the student to explain: **saved on this device** means local storage; **synced** means the server confirmed it; **Discord delivered** is a separate outcome.

Expected: the answers remain distinct, the assigned robot/match is correct, and the student can explain the status. The AI checks the stored record.

### B. Airplane mode, interruption and reconnection (P03–P04)

Repeat on each phone:

1. While online, open the event, tap **Refresh** and **Sync now**, and wait for existing work to synchronize.
2. Enable airplane mode and explicitly turn Wi-Fi off as well; phones may keep Wi-Fi enabled in airplane mode. Confirm an uncached ordinary webpage will not load.
3. Record the AI-assigned test observation. Wait for its local-save acknowledgment. Begin another observation, type a distinctive draft note, and wait for its draft-save acknowledgment.
4. Lock the phone, unlock it, then close the browser/app from the app switcher and reopen it. This means closing it, not deleting it. Reopen the prepared event while still offline; reload the page too.
5. Verify the saved pending observation and the unfinished draft note are still present. Record exactly what disappeared if either is missing.
6. Restore connectivity and tap **Sync now**. Ask the AI to confirm exactly one logical server record for the saved observation and the correct answers. The unfinished draft must not silently become a submitted observation.

Expected: no lost acknowledged work, no duplicate logical record, and no false “delivered” claim offline. If storage is refused, the app must say the work was not saved; keep the page open and report it.

### C. Account/session and correction drills (P05–P07)

The AI prepares each scenario in the isolated test system; you do not manipulate browser storage or tokens.

- **Expired session:** when the AI tells you the test session has expired, reopen the already-prepared event offline. Prepared local work should remain usable; uploading must wait for valid sign-in. Report any unexpected login wall or lost work.
- **Account change:** queue a fictional save under test account A, then switch to test account B as instructed. B must not see or upload A's local proposal. Return to A and check recovery. Do not use real students' credentials for this drill.
- **Conflicting edits:** on two phones under the appropriate test account, open the same existing observation before either person saves. Edit differently on both, save the first, then the second. Expect an explicit conflict, not a silent overwrite. Use **Review conflict** as directed; the AI checks versions and attribution.

### D. Backup and difficult-storage recovery (P17–P18)

1. Prepare one pending fictional save with Discord delivery unchecked. Tap **Export event data** and confirm the downloaded file exists. Keep the original phone unchanged.
2. Transfer the file privately to a second prepared browser/device using the same test account and event. In **Recover pending saves from a backup**, choose the file, select the pending save, then choose **Restore … selected saves for review**.
3. Reload and reconnect. The restored save should still be awaiting review; it must not upload automatically.
4. In **Saved work on this device**, review it and choose **Retry original save**. The AI verifies exactly one logical server record, including when the original already reached the server.
5. For unreadable-draft or delayed-save drills, wait for the AI's controlled test setup. Editing should pause after a failed draft read; a successful retry should restore it. A slow save must not report the latest change saved before it is actually durable. Report whether the message is understandable.

Backup recovery here restores pending submissions. The archive also contains practice, drafts and maps for review, but this control does not automatically restore those other sections. Do not erase the original phone to test recovery.

## 5. Have a mentor validate real scouting skill (P08–P10)

The AI should do the accessible source research, organize recordings and prepare the worksheet. The mentor supplies independent judgment about what the robot actually did.

1. Before the student's assessment, have the mentor independently review six selected real recording intervals: clear success, visible failed attempt, obstructed view, non-attempt/not-applicable, disagreement, and a supported correction. One recording can supply multiple separately identified intervals. The actual choices are not yet frozen.
2. Record the event, match, robot, time interval and expected answer with supporting notes. Preserve ambiguity. The AI enters these into [FOOTAGE_CORPUS.csv](FOOTAGE_CORPUS.csv) and records when the key was frozen. Do not derive the key from the student's answers or the app's output. Use a second independent reviewer where possible.
3. Follow the eight-mission, planned three-hour session in [TRAINING.md](TRAINING.md). It includes interviews, six simulations, real footage, offline recovery, pick-list reasoning, communication and a scrimmage. Record actual time and help rather than assuming the planned time occurred.
4. In **Practice**, record and freeze the first footage attempt before discussion. Keep later corrections separate. Export the practice packet for mentor review.
5. The mentor rates each rubric area **not yet observed**, **needs coaching**, or **independent**, with concrete evidence. Assign more practice where needed. The mentor records official certification in IDEA Classroom; completing the app's missions alone does not certify proficiency.

Original TideScout fidelity (P15) is a separate source-review task. The AI should inspect the original [tutorial](https://www.youtube.com/watch?v=XM7l9Z1HiDs) once access works. If it remains inaccessible to the AI, you may need to supply authorized original clips/screenshots or facilitate legitimate app/export access. Do not recreate the technical evidence matrix yourself or treat captions as inspected video.

## 6. Have the drive coach rehearse a real decision (P19)

1. Use a historical or practice match with a known six-team lineup. In **Teams → Drive-team match brief**, enter the match, the three teams on your alliance and the three opponents. Verify the lineup against the actual schedule.
2. With the coach and partner representatives, agree on opening/autonomous coordination, robot roles, endgame and fallback plans. Mark unresolved questions. Review missing/disputed evidence; do not invent a capability to fill a blank.
3. Wait for **Brief saved on this device**, then tap **Confirm lineup and review brief**. Export the JSON and printable brief. Open the printable file and use the browser's Print command or save it as PDF.
4. Close/reopen and try an offline edit. The saved plan should return, and a changed plan should require review again before export.
5. Have the coach report what was useful, misleading, too slow or missing. The AI makes the fixes and checks stored evidence. An automated test cannot decide whether the brief helped the coach.

## 7. Check the actual venue when available (P16)

On each scouting phone, while connected, open **Teams → Pit map and directory**, confirm the correct Nexus event key, and download the map. Compare several known pits, entrances and walls with real signs. Try search, zoom and rotation, then reload offline. Report wrong or missing locations and confusing controls. Each phone must download its own cache. A rehearsal map is not proof of the actual venue layout.

## 8. Make the two explicit release decisions when ready (P14 and production)

These are decisions for you; the technical work remains the AI's responsibility.

- **Real Discord test:** only after the AI has prepared and shown the exact destination and harmless message, explicitly approve that one test. The AI can send it if the authorized tool/configuration is available; a person with channel access confirms it appeared once. Do not authorize a broad notification blast. Deliberate failure drills should use the isolated environment or mocks, not disable the real team's bot.
- **Production release:** after you have reviewed the actual remaining risks and acceptance results, explicitly authorize the identified commit and release packet. For example: “I authorize production release of commit [exact commit shown in the release packet].” The AI handles the database/functions/app work and verification within that scope. This is not authorization to discard scouting records or to send unrelated messages.

Until then, production and main remain unchanged. A green test report is not a request for you to deploy anything yourself.

## What to send back

Plain text is enough. You do not need to edit a spreadsheet:

```text
Test link/build supplied by AI:
Test event:
Phone model and browser:
Person doing the task: beginner / mentor / coach (no private student details needed)
Task or step:
Elapsed time:
What I expected:
What actually happened:
Mistakes or help needed:
Screenshot/video filename, if useful:
```

The AI translates your observations into [FIELD_ACCEPTANCE.csv](FIELD_ACCEPTANCE.csv), links evidence, records failures and fixes them. The 19 acceptance gates currently remain **16 not run and three partial**; writing this guide does not pass any gate. P11–P13 are principally AI-owned hosted database/provider/dispatch checks, not instructions for you to operate Supabase manually.
