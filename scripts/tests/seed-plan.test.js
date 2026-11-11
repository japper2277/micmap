const test = require('node:test');
const assert = require('node:assert/strict');
const { planSeed } = require('../../api/scripts/seed-plan');
const { canAttachFlyer, copyFlyer, hasSafeConfidence } = require('../apply-ig-signups');
const mic = { name: 'Test mic', day: 'Monday', startTime: '7:30 PM', venueName: 'Test venue' };
test('seed preserves saved-plan identity and explicitly retracts absent flyer', () => {
  const ops = planSeed([{ ...mic, notes: 'updated' }], [{ ...mic, _id: 'stable', flyerUrl: 'old' }]);
  assert.deepEqual(ops[0].updateOne.filter, { _id: 'stable' });
  assert.equal(ops[0].updateOne.upsert, false);
  assert.equal(ops[0].updateOne.update.$set.flyerUrl, null);
});
test('seed rejects empty, duplicate, and missing identities before writes', () => {
  assert.throws(() => planSeed([], [mic]), /empty/);
  assert.throws(() => planSeed([mic, { ...mic }], []), /Duplicate/);
  assert.throws(() => planSeed([mic], [{ ...mic, _id: 'a' }, { ...mic, _id: 'b' }]), /Duplicate/);
  assert.throws(() => planSeed([{ ...mic, day: 'Tuesday' }], [mic]), /review removals/);
});
test('new rows use upserts; repeated seed targets existing identity', () => {
  assert.equal(planSeed([mic], [])[0].updateOne.upsert, true);
  assert.deepEqual(planSeed([mic], [{ ...mic, _id: 'stable' }])[0].updateOne.filter, { _id: 'stable' });
});
test('flyers require safe classification, confidence, and matching extracted schedule', async () => {
  const entry = { classification: 'safe_write', confidence: .99, candidateFields: { ...mic }, screenshotPath: '/nonexistent' };
  assert.equal(canAttachFlyer(entry, mic), true);
  for (const change of [{ classification: 'review_required' }, { confidence: .5 }, { candidateFields: {} },
    { candidateFields: { ...mic, startTime: '9:10 PM' } }, { candidateFields: { ...mic, day: 'Tuesday' } }]) {
    assert.equal(canAttachFlyer({ ...entry, ...change }, mic), false);
    assert.equal(await copyFlyer({ ...entry, ...change }, mic, true), null);
  }
});

test('confidence rejects malformed, unbounded and absent values for all writes', () => {
  for (const confidence of ['unknown', '0.99', true, [1], ['0.99'], NaN, Infinity, -1, 2, null, undefined]) {
    assert.equal(hasSafeConfidence({ confidence }), false);
  }
  assert.equal(hasSafeConfidence({ confidence: .85 }), true);
});
test('seed retracts omitted seed fields while preserving runtime counters', () => {
  const op = planSeed([mic], [{ ...mic, _id: 'stable', notes: 'old', endTime: 'old', score: 9 }])[0].updateOne;
  assert.equal(op.update.$unset.notes, '');
  assert.equal(op.update.$unset.endTime, '');
  assert.equal('score' in op.update.$unset, false);
  assert.equal('score' in op.update.$set, false);
});
