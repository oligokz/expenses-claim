// Server logic that has no network in it. Run with: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const { sgDay, sgMonth } = require('../api/_lib/dates');
const { toSGD } = require('../api/_lib/rates');
const { getModule, currentStage, waitingOn, blockedReason } = require('../api/_lib/approvals');

test('sgDay uses Singapore time, not UTC', () => {
  // 23:30 UTC on the 14th is already the 15th in Singapore.
  assert.equal(sgDay('2026-10-14T23:30:00Z'), '2026-10-15');
  assert.equal(sgDay('2026-10-14T03:00:00Z'), '2026-10-14');
  assert.equal(sgMonth('2026-10-31T17:00:00Z'), '2026-11');
});

test('sgDay passes plain dates through and rejects junk', () => {
  assert.equal(sgDay('2026-02-28'), '2026-02-28');
  assert.equal(sgDay('not a date'), '');
});

test('toSGD divides by the rate and refuses unknown currencies', () => {
  const rates = { SGD: 1, USD: 0.75 };
  assert.equal(toSGD(75, 'USD', rates), 100);
  assert.equal(toSGD(10, 'SGD', rates), 10);
  assert.equal(toSGD(10, 'XYZ', rates), null);
});

const travel = getModule('travel');
const trip = (over = {}) => ({
  Status: 'Pending',
  ReportingManager: 'annie@x',
  FinanceApprover: 'joanne@x',
  FinalApprover: 'joseph@x',
  ReportingManagerStatus: 'Pending',
  SubmissionDate: '2026-10-14',
  ...over,
});

test('travel goes Reporting Manager, then Finance/HR, then Final Approval', () => {
  assert.equal(currentStage(travel, trip()).label, 'Reporting Manager');
  assert.equal(
    currentStage(travel, trip({ ReportingManagerStatus: 'Approved' })).label,
    'Finance/HR',
  );
  assert.equal(
    currentStage(travel, trip({ ReportingManagerStatus: 'Approved', FinanceApprovalStatus: 'Approved' })).label,
    'Final Approval',
  );
});

test('a rejection or a decided request is waiting on no one', () => {
  assert.equal(currentStage(travel, trip({ ReportingManagerStatus: 'Rejected' })), null);
  assert.equal(currentStage(travel, trip({ Status: 'Approved' })), null);
});

test('waitingOn counts from the last approval', () => {
  const w = waitingOn(travel, trip({ ReportingManagerStatus: 'Approved', ReportingManagerDate: '2026-10-16' }));
  assert.equal(w.email, 'joanne@x');
  assert.equal(w.since, '2026-10-16');
});

test('a request can be deleted only before anyone approves it', () => {
  assert.equal(blockedReason(travel, trip()), null);
  assert.match(blockedReason(travel, trip({ ReportingManagerStatus: 'Approved' })), /already approved/);
  assert.match(blockedReason(travel, trip({ Status: 'Rejected' })), /already rejected/);
});
