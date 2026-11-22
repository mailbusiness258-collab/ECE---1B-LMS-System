# ECE 1B Class Portal — Security Specification & Dirty Dozen Payloads

## Data Invariants
1. **Identity & Role Integrity**: Users can never self-assign `roleLabel: 'Officer'` in `/roster` or create `/admins/{uid}` without either an existing admin creating it or matching a verified email in `/officerInvites`.
2. **PII Isolation**: Personal emails and private profile metadata live exclusively in `/users/{uid}` (readable only by the owner or admins) and are omitted from the shared `/roster` collection.
3. **Referential Integrity**: `/users/{uid}/taskProgress/{taskId}` cannot be created unless `/tasks/{taskId}` exists. `/quizAttempts/{attemptId}` cannot be created unless `/quizzes/{quizId}` exists.
4. **Temporal & Immutable Field Enforcement**: All `createdAt` / `updatedAt` timestamps must equal `request.time`. Author/owner UIDs (`uid`, `studentUid`, `authorUid`) cannot be reassigned or spoofed.
5. **Query Security**: Collection `list` queries on `/users`, `/admins`, `/officerInvites`, `/quizzes`, and `/quizAttempts` enforce `resource.data` or `isAdmin()` constraints directly in rules rather than relying on client queries.
6. **Strict Schema & Size Bounds**: Every string, map, and array enforces strict key allowlists (`hasOnly`) and `.size()` bounds; IDs match `^[a-zA-Z0-9_\-]+$`.

## The Dirty Dozen Payloads (Must All Yield PERMISSION_DENIED)
1. **Self-Promotion in `/admins/{uid}`**: Non-admin user writes `{ uid: attackerUid, email: attackerEmail, fullName: 'Hacker', title: 'President', addedBy: attackerUid, createdAt: request.time }` without a valid `officerInvite`.
2. **Shadow Field Injection on `/users/{uid}`**: User creates `/users/{uid}` with extra ghost field `isAdmin: true`.
3. **Unverified Email Write**: User with `email_verified: false` attempts to create `/roster/{uid}`.
4. **Roster Role Escalation**: Non-admin student attempts to update their `/roster/{uid}` doc to `roleLabel: 'Officer'`.
5. **Spoofed Quiz Attempt Owner**: Student A creates `/quizAttempts/att1` with `studentUid: studentBUid`.
6. **Orphaned Quiz Attempt**: Student creates `/quizAttempts/att2` referencing non-existent `quizId: 'non_existent_quiz'`.
7. **Orphaned Task Progress**: Student creates `/users/{uid}/taskProgress/fake_task` when `/tasks/fake_task` does not exist.
8. **Client-Forged Timestamp**: Admin or student creates a document with a backdated `createdAt` instead of `serverTimestamp()`.
9. **Non-Admin Material / Chapter / Flashcard / Quiz Creation**: Regular student attempts to create `/chapters/ch1`, `/materials/mat1`, `/flashcardDecks/deck1`, or `/quizzes/quiz1`.
10. **PII Scraping**: Regular student attempts `list` or `get` on `/users/{otherUid}`.
11. **Unpublished Quiz Leakage**: Regular student attempts `get` on an unpublished quiz (`published: false`).
12. **Resource Exhaustion / Oversized ID**: Attacker attempts `setDoc` with a 300-character document ID or invalid characters (`../evil`) or 10KB `title` string.
