
Private dot REC update acceptance:
- Keep the exact prior private queue (including legacy additions, schedule patches
  and original Excel ops) intact in scoped private checks; never commit its data.
  Source updates use explicit versioned IDs, exact predecessor hashes and source
  before/after snapshots, not a fresh local snapshot that erases hand edits.
- Exercise real owner receive, native transactional save, the target REC song's
  actual lyric view and 進行表 button, date/member/order/start/end/break rows,
  save and native reload. Keep completed takes, actual times, notes, manual lyric
  breaks, source copies, original bytes and unrelated member sharing settings.
- Keep old receiver failures for the new update protocol. Hold conflicting local
  edits and ambiguous identities. Explicitly supersede an unapplied held operation
  without rewriting its immutable queue record; never replace an applied head.
- Verify private result outbox -> fixed repository/owner -> optimistic write ->
  reread, exact source SHA and session head. Show held/pending accurately. Test
  scope denial, unavailable writer, bad sequence, native reload and duplicate
  reception. A browser mock of private GitHub transport is not proof of the real
  phone's result. Confirm server source capability and exact deployed revision;
  do not install the environment GH_TOKEN as a server secret.
