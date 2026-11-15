# Insurance and road booking hardening — 14/11/2026

## Scope and result

Working copy: `D:\G4_fow4_pay\SWP391_GROUP1`, branch `codex/harden-insurance-road-booking`, base `7292f75`.

Implemented and verified insurance declarations/premiums and the approved manual road Shared/Dedicated workflow. No commit, push or merge performed. Existing untracked `backend/.idea/` was preserved. The current pass results below come from fresh runs against the final code, not historical test totals.

- Backend HTTP/MySQL + policy/regression suite: **90/90 PASS**.
- Frontend tests: **46/46 PASS**.
- Backend and Frontend builds and explicit TypeScript checks: **PASS**.
- Six booking/insurance API workflows: **PASS**, including invoice/payment persistence after a real test-API restart.
- Browser checks: customer login/form, Standard/Premium/USD preview, Dedicated review, Manager zero-price rejection and repaired Dashboard approval navigation: **PASS**. These browser checks did not create requests or approve valid quotes on the application database.

This is a focused implementation/verification report for the two requirements. It does not reclassify every item in the older 102-criterion audit as complete.

## Confirmed defects fixed

| Defect and reproduction | Root cause | Fix and ownership |
|---|---|---|
| Shared simultaneous allocation returned 201/500; Dedicated could also return 500. Initial suite: 78/80; expanded before-fix regressions also failed. | InnoDB diagnostics showed a route-leg `fk_leg_route` supremum/gap lock held while waiting for a vehicle; the other transaction held that vehicle and waited to insert a route leg. | [routes.store.ts](../backend/src/modules/routes/routes.store.ts): use `SET TRANSACTION ISOLATION LEVEL READ COMMITTED` for the next save/confirmation transaction. Preserve shipment/route/ordered vehicle row locks; evaluate committed reservations after acquiring the vehicle lock. |
| A legacy road reservation without its duplicated `shipment_vehicle` link could be bypassed through unscheduled assignment. | Fleet assignment checked only `shipment_vehicle`, not existing route-leg reservations. | [fleet.store.ts](../backend/src/modules/fleet/fleet.store.ts): check both sources under the vehicle lock. Unscheduled assignment rejects the reserved vehicle; timed sharing remains in route planning. |
| `npm run migrate:transport-mode` failed even though applying the SQL directly passed. | Splitting SQL on every semicolon split a line comment in migration 020 into invalid SQL. | [apply-transport-mode-migration.cjs](../database/apply-transport-mode-migration.cjs): execute the fixed repository-owned SQL file intact. Multiple statements are enabled only for this migration connection. Actual CLI commands are now exercised in isolation. |
| Dashboard Approve used a separate `Total Cost (USD)` modal and sent that number as legacy VND base freight, without Shared unit pricing or insurance review. New real-component handler test failed before the fix. | Approval shortcut diverged from the request list/detail pricing flow. | [manager/page.tsx](../frontend/src/app/manager/page.tsx): Approve navigates to full request detail; remove the obsolete approval modal and direct API call. Reject/change actions retain their existing behavior. |
| An unfinished horse reservation could be bypassed if an older/profile update left `horse.status = active`. Regression initially reported a missing rejection. | New-order reservation trusted the profile status without checking existing unfinished shipment references. | [orders.store.ts](../backend/src/modules/orders/orders.store.ts): check unfinished shipment-horse references under the existing horse lock before taking a new reservation. Requested corrections preserve their existing horses. No historical profile is rewritten. |

## Local environment brought up to date

The actual local MySQL was missing the insurance columns, booking fields, road-trip table and invoice migration. Before migrating, the Backend watcher was stopped and a complete dump was saved outside Git:

`C:\Users\tdinh\.codex\verification\insurance-road-20261114\local-before.sql`

Applied existing migrations 015–020 with the new `npm run migrate:order-features` command. Compared original records immediately after migration and again after browser checks: all **4 orders**, original totals/statuses/horse counts, **5 shipment-horse links**, **6 horse profiles** and **11 accounts** were retained. No fixture orders or test bank settlements were written to this application database.

Configured only local `backend/.env` with the explicitly approved **25,000 VND/USD test valuation rate**. The tracked example keeps the rate blank. It is not a live bank rate. Existing declarations retain their snapshotted rates.

Added [disposable-mysql.cjs](../backend/scripts/disposable-mysql.cjs) for a fresh temporary native MySQL server when Docker is unavailable. It uses a new data directory and separate loopback port, verifies the server's data-directory identity before changing its temporary root credential, and removes its own data after shutdown. It never accepts the application database connection. Docker remains the default runner mode.

## Test cases and actual evidence

Evidence directory: `C:\Users\tdinh\.codex\verification\insurance-road-20261114`.

| ID | Expected result | Actual result | Status / evidence |
|---|---|---|---|
| I01 | Basic premium 0; cap 50,000,000 VND/horse. | Policy, saved response and coverage assertions match. | PASS — `insurance-policy.test.cjs`, `insurance.integration.cjs` |
| I02 | Standard premium 1.5%; compensation limit 80%. | 100,000,000 VND produces 1,500,000 premium and 80,000,000 cap. | PASS — insurance policy tests |
| I03 | Premium premium 3%; compensation 100%; emergency veterinary coverage. | 100,000,000 VND produces 3,000,000 premium, full declared cap and coverage flag. | PASS — insurance policy tests |
| I04 | USD uses server rate and preserves the stored rate on unchanged declarations. | Test rate 25,000 converts 10,000 USD to 250,000,000 VND; saved-rate resubmission remains unchanged after a rate change. | PASS — insurance policy/integration tests |
| I05 | Invalid, negative, excessive-precision, unknown and overflowing values fail atomically. | Invalid requests return 400 without orphan orders or horse status changes. | PASS — `insurance.integration.cjs` |
| I06 | Ignore customer-provided fees, compensation and FX rates. | Mixed-package order uses server-calculated values, including aggregate premium 10,500,000 VND. | PASS — insurance HTTP tests |
| I07 | Partial policy/identity amendments preserve omitted package, currency, quantity and saved FX. | Existing quantities and policies remain; deliberate changes recalculate and append history. | PASS — controlled + insurance HTTP tests |
| I08 | Notes-only resubmission does not create a false policy revision. | Policies and quantities unchanged; no new insurance revision. | PASS — insurance HTTP tests |
| I09 | Foreign horses and another owner's order are inaccessible. | Invalid horse selection rolls back; foreign reads return 403. | PASS — insurance/road HTTP tests |
| I10 | An unfinished reservation blocks a new order despite a stale active flag. | New order returns 400; one original horse link remains. | PASS — new unit + HTTP regression |
| B01 | Shared freight equals stall unit price times total horse quantity. | 2,000,000 × 2 = 4,000,000 VND; row quantities are counted, not profile rows. | PASS — booking policy/HTTP/FE tests |
| B02 | Dedicated freight stays flat. | 10,000,000 VND stays 10,000,000 for 3 horses; insurance is separate. | PASS — booking policy/HTTP tests |
| B03 | Reject missing/null/empty/zero/negative/non-number/fractional/overflow freight. | Backend validation rejects invalid quotes; stored quote remains unchanged. | PASS — booking policy + road HTTP tests |
| B04 | Reject stale booking/count and mixed unit/total fields. | Backend rejects changed views and conflicting totals. | PASS — booking tests |
| B05 | Preserve booking and policy during partial update; audit explicit booking changes. | Booking revision and quote clearing behave as specified. | PASS — booking + controlled tests |
| B06 | Dashboard approval must show the full pricing/policy flow. | Button opens `/manager/requests/74` in browser; regression handler opens the matching fixture detail. | PASS — FE regression + browser |
| R01 | Two customers can share one compatible road trip. | Both 2-horse orders are saved on a 4-stall trip. | PASS — road HTTP test |
| R02 | Concurrent Shared 2+2 on capacity 4 both succeed. | 201/201, database sum exactly 4; repeated 5 times. | PASS — new road HTTP regression |
| R03 | Concurrent Shared 3+3 on capacity 4 admits one booking. | 201/400, reserved total 3; repeated 5 times. | PASS — road HTTP regression |
| R04 | Concurrent Dedicated cannot allocate the same vehicle to both orders. | 201/400, one exclusive reservation; repeated 5 times. | PASS — road HTTP regression |
| R05 | Failed concurrent allocation leaves no partial legs. | Losing order has zero saved route legs. | PASS — both concurrency tests |
| R06 | Dedicated blocks overlapping bookings but permits a non-overlapping interval. | Overlap returns 400; interval starting at the former end succeeds. | PASS — road HTTP tests |
| R07 | Client cannot change selected trip's vehicle/route/time/slot count. | Canonical trip fields replace supplied values; `stallsBooked: 999` is ignored. | PASS — road policy/HTTP + FE tests |
| R08 | Legacy route reservations cannot be bypassed by unscheduled assignment. | Assignment returns 400 and creates no vehicle link. | PASS — new road HTTP regression |
| R09 | Shared membership cannot reveal another customer's orders, route or assignments. | Customer catalog access and foreign order/route/assignment reads return 403. | PASS — road HTTP tests |
| P01 | No invoice payment before route/staff confirmation. | Early QR request returns 400; confirmed route produces matching invoice. | PASS — gating/road/insurance tests |
| P02 | All six booking/insurance combinations use freight + insurance exactly once. | Shared/Dedicated × Basic/Standard/Premium complete pricing, planning, invoice and test payment correctly. | PASS — six road HTTP workflows |
| P03 | MoMo sandbox must not mark real payment/readiness successful. | Sandbox-only confirmation leaves official payment/readiness false. | PASS — controlled/road HTTP tests |
| P04 | Signed bank fixture settles only matching stored amount/code under test configuration. | Signed simulated bank webhook settles test invoices; no real transfer performed. | PASS — SePay/road HTTP tests |
| P05 | Payment and policy snapshots survive process restart. | Restarted isolated Nest API returns unchanged snapshots, invoice amounts and succeeded test-bank payments for all six combinations. | PASS — runner restart assertions |
| M01 | Fresh schema, old-schema upgrade and rerun preserve legacy data. | Migration assertions retain historical total 1,234,567, quantities, Domestic/International scope and historical route leg. | PASS — `integration-final.log` |
| M02 | Actual migration commands must work, not only direct SQL. | All six CLI commands execute again successfully against the isolated server. | PASS — runner CLI assertions |
| L01 | Local upgrade must preserve existing user data. | Original order totals/status/counts and all accounts match the pre-migration snapshot. | PASS — local read-only checks |
| L02 | Customer list/details, road-trip catalog and role logins work after upgrade. | Customer list and all 4 details return 200; catalog loads; Customer/Manager/Coordinator/Specialist/Driver login succeeds. | PASS — local HTTP checks |
| U01 | Customer form shows correct live insurance and booking summary. | Browser Standard 100,000,000 VND preview = 1,500,000; Premium 10,000 USD = 7,500,000; Dedicated review shows pending freight separately. | PASS — `customer-review.jpg` |
| U02 | Manager sees booking/policy and cannot approve price 0. | Browser modal shows breakdown; zero produces validation alert; no valid quote was submitted. | PASS — `manager-quote.jpg`, browser observations |
| Q01 | Compile/type checks and current tests pass. | BE 90/90; FE 46/46; BE/FE builds and `tsc --noEmit --incremental false` succeed. | PASS — final logs |

## Commands and logs

From `backend`:

```powershell
npm run build
npx tsc --noEmit --incremental false
$env:TEST_MYSQL_BASEDIR = 'D:\G4_fow4_pay\SWP391_GROUP1\backend\.local\mysql\mysql-8.4.13-winx64'
node scripts/test-payment-gate.cjs
```

From `frontend`, with the development server stopped during production build:

```powershell
node --test test/*.test.cjs
npx tsc --noEmit --incremental false
npm run build
```

Key logs: `baseline.log`, `baseline-locks.log`, `regression-before.log`, `migration-cli-before.log`, `late-backend-before.log`, `late-frontend-before.log`, `integration-final.log`, `frontend-tests-final.log`, `backend-build.log`, `backend-typecheck.log`, `frontend-build-final.log`, `frontend-typecheck-final.log`. An intermediate FE typecheck caught a remaining reference to the removed Dashboard approval state; that line was removed and the final FE test/typecheck/build command exited 0. Only the `*-final.log` FE files are final-pass evidence.

## Limits and readiness

- Ready for team testing of the approved **road** scope on this local build. The application services are restored on FE 3000 / BE 5000.
- Air sharing/charter operations remain an **OPEN DECISION**, as explicitly agreed. Existing air fields/logic were preserved; no whole-aircraft/private-compartment rule was invented. Selection UI makes the separate confirmation requirement explicit.
- No real payment, external insurer integration or claim adjudication/settlement was performed or added. Premium stores the specified emergency-veterinary coverage entitlement; it does not invent a separate fixed cap for actual emergency expenses.
- Six complete workflows were verified through the real API and isolated MySQL. Browser verification covers the form/preview/review and Manager entry/validation paths, not six complete browser-driven payment journeys.
- Native integration used the installed MySQL 8.4.13 binary; the Docker/MySQL 8.0 variant was not run in this session.
- A pre-existing Flow 4 sample-seeding foreign-key warning was observed at application startup. It is outside these two feature fixes; it is not treated as a passing Flow 4 seed test or evidence of general production readiness.
- Historical profile flags are not silently rewritten: an inconsistent `active` horse still referenced by an unfinished order now receives a clear server rejection instead of a duplicate reservation.
- No claim of full-project/102-criterion completion or production release approval is made by these focused results.
