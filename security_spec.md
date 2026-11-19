# Security Specification & Payload-First TDD (`security_spec.md`)

## 1. Data Invariants
1. **Authentication & Email Verification**: No unauthenticated or unverified user (`email_verified != true`) may read, list, create, update, or delete any document in `students`, `cars`, `scans`, `users`, `settings`, or `admins`.
2. **Identity Integrity (`ownerId`)**: Every newly created document in `students`, `cars`, `scans`, `users`, and `settings` MUST set `ownerId == request.auth.uid`. `ownerId` is immutable on update (`incoming().ownerId == existing().ownerId`).
3. **Temporal Integrity (`createdAt`, `updatedAt`)**: Server timestamps (`request.time`) are strictly enforced on `create` (`createdAt == request.time && updatedAt == request.time`) and `update` (`createdAt == existing().createdAt && updatedAt == request.time`).
4. **Path Variable Hardening (`isValidId`)**: All document IDs (`studentId`, `carId`, `scanId`, `userId`, `settingKey`) must match `^[a-zA-Z0-9_\-]+$` with length 1–128 characters.
5. **PII Isolation & Query Enforcement**: `students` (containing parent phone numbers and names) and `users` (containing emails) restrict `get` and `list` to `isBootstrappedAdmin()` (zero-read token check for verified `totooren9@gmail.com`) or the record owner (`existing().ownerId == request.auth.uid`). No `get()` or `exists()` calls are placed inside `allow list` rules.
6. **Strict Schema & No Shadow Fields**: Every collection uses an `isValid[Entity](data)` helper enforcing `keys().hasAll(...)` and `keys().hasOnly(...)`, type checks, and `.size()` bounds on every string.
7. **Admin Registry Protection**: Only verified admins (`isBootstrappedAdmin()` or existing `/admins/{uid}`) can read or modify `/admins/{userId}`.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Unauthenticated Student Read**: Anonymous request attempts `get /students/STD0001` -> `PERMISSION_DENIED`.
2. **Unverified Email Write**: Authenticated user with `email_verified: false` attempts `create /students/STD9999` -> `PERMISSION_DENIED`.
3. **Identity Spoofing on Create**: Verified non-admin user attempts `create /students/STD9001` with `ownerId: "other-uid"` -> `PERMISSION_DENIED`.
4. **Shadow Field Injection ("Ghost Field")**: Verified user sends valid student payload plus `isAdmin: true` or `extraFlag: true` -> `PERMISSION_DENIED` (blocked by `hasOnly`).
5. **Client-Forged Timestamp**: Verified user sends `createdAt: Timestamp.fromMillis(0)` instead of `serverTimestamp()` -> `PERMISSION_DENIED`.
6. **Immutable Field Mutation**: Verified user attempts to update `ownerId` or `createdAt` or `student_id` on an existing student -> `PERMISSION_DENIED`.
7. **ID Poisoning / Resource Exhaustion**: User attempts to create a student with a 300-character ID or invalid characters (`STD/../../etc`) -> `PERMISSION_DENIED` (`isValidId`).
8. **String Size Exhaustion (Denial of Wallet)**: User attempts to write a 10,000-character `note` in `/scans/SCN-1` (max 500) or 1,000-character `name` (max 200) -> `PERMISSION_DENIED`.
9. **Blanket List Query Scraping**: Verified non-admin user queries `/students` without `where('ownerId', '==', uid)` -> `PERMISSION_DENIED`.
10. **PII Cross-User Read**: Verified non-admin user B attempts `get /students/STD0001` owned by user A -> `PERMISSION_DENIED`.
11. **Privilege Escalation on `/admins`**: Non-admin user attempts to create `/admins/{myUid}` -> `PERMISSION_DENIED`.
12. **Invalid Enum Value**: User attempts to create `/scans/SCN-9` with `scan_type: "hacked"` instead of `"ขึ้นรถ"` or `"ลงรถ"` -> `PERMISSION_DENIED`.
