const request = require('supertest');
const Mic = require('../../models/Mic');
const SharedPlan = require('../../models/SharedPlan');
const app = require('../../server');

describe('Shared plan collaboration', () => {
  let micOne;
  let micTwo;
  let micThree;

  beforeEach(async () => {
    [micOne, micTwo, micThree] = await Mic.create([
      {
        name: 'Early Bird Mic',
        day: 'Monday',
        startTime: '7:00 PM',
        endTime: '8:00 PM',
        venueName: 'Early Venue',
        borough: 'Brooklyn',
        neighborhood: 'Williamsburg',
        address: '123 Early St',
        lat: 40.71,
        lon: -73.95,
        cost: 'Free'
      },
      {
        name: 'Prime Time Mic',
        day: 'Monday',
        startTime: '8:30 PM',
        endTime: '9:30 PM',
        venueName: 'Prime Venue',
        borough: 'Manhattan',
        neighborhood: 'East Village',
        address: '456 Prime Ave',
        lat: 40.72,
        lon: -73.98,
        cost: '$5'
      },
      {
        name: 'Late Set Mic',
        day: 'Monday',
        startTime: '9:30 PM',
        endTime: '10:30 PM',
        venueName: 'Late Venue',
        borough: 'Queens',
        neighborhood: 'Astoria',
        address: '789 Late Blvd',
        lat: 40.76,
        lon: -73.92,
        cost: 'Free'
      }
    ]);
  });

  test('creates a shared plan with stable links and snapshot-backed stops', async () => {
    const response = await request(app)
      .post('/api/v1/shared-plans')
      .send({
        plannerName: 'Jared',
        plannerNote: 'Starting in Bushwick',
        stops: [
          {
            micId: 'dynamic-slot-1',
            stayMins: 30,
            micSnapshot: {
              id: 'dynamic-slot-1',
              venueName: 'Pop-Up Room',
              title: 'Pop-Up Room',
              day: 'Monday',
              startTime: '7:45 PM',
              cost: 'Free',
              lat: 40.715,
              lng: -73.94
            }
          },
          {
            micId: String(micTwo._id),
            stayMins: 45
          }
        ]
      })
      .expect(201);

    expect(response.body.success).toBe(true);
    expect(response.body.shareId).toBeTruthy();
    expect(response.body.shareUrl).toContain('/share/?shared=');
    expect(response.body.mapUrl).toContain('/?shared=');
    expect(response.body.plan.stops).toHaveLength(2);
    expect(response.body.plan.stops[0].mic.venueName).toBe('Pop-Up Room');
    expect(response.body.plan.stops[1].mic.venueName).toBe('Prime Venue');

    const saved = await SharedPlan.findOne({ shareId: response.body.shareId });
    expect(saved).toBeTruthy();
    expect(saved.plannerName).toBe('Jared');
  });

  test('loads and patches a shared plan with optimistic concurrency', async () => {
    const created = await request(app)
      .post('/api/v1/shared-plans')
      .send({
        plannerName: 'Alex',
        stops: [
          { micId: String(micOne._id), stayMins: 45 },
          { micId: String(micTwo._id), stayMins: 45 }
        ]
      })
      .expect(201);

    const shareId = created.body.shareId;

    const loaded = await request(app)
      .get(`/api/v1/shared-plans/${shareId}`)
      .expect(200);

    expect(loaded.body.plan.shareId).toBe(shareId);
    expect(loaded.body.plan.revision).toBe(1);

    await request(app)
      .patch(`/api/v1/shared-plans/${shareId}`)
      .send({
        revision: 999,
        plannerNote: 'Bad revision'
      })
      .expect(409);

    const patched = await request(app)
      .patch(`/api/v1/shared-plans/${shareId}`)
      .send({
        revision: 1,
        plannerName: 'Alex',
        plannerNote: 'Meet me before Prime Time',
        meetupStopId: String(micTwo._id)
      })
      .expect(200);

    expect(patched.body.success).toBe(true);
    expect(patched.body.revision).toBe(2);
    expect(patched.body.plan.plannerNote).toBe('Meet me before Prime Time');
    expect(patched.body.plan.meetupStopId).toBe(String(micTwo._id));
    expect(patched.body.plan.meetupRecommendation.source).toBe('manual');
  });

  test('upserts participant responses with in/maybe/meet_later', async () => {
    const created = await request(app)
      .post('/api/v1/shared-plans')
      .send({
        plannerName: 'Maya',
        stops: [
          { micId: String(micOne._id), stayMins: 45 },
          { micId: String(micTwo._id), stayMins: 45 }
        ]
      })
      .expect(201);

    const shareId = created.body.shareId;

    const first = await request(app)
      .post(`/api/v1/shared-plans/${shareId}/responses`)
      .send({
        name: 'Josh',
        response: 'maybe',
        targetMicId: String(micTwo._id)
      })
      .expect(200);

    expect(first.body.plan.responses).toHaveLength(1);
    expect(first.body.plan.responses[0].response).toBe('maybe');

    const second = await request(app)
      .post(`/api/v1/shared-plans/${shareId}/responses`)
      .send({
        name: 'Josh',
        response: 'meet_later',
        targetMicId: String(micTwo._id)
      })
      .expect(200);

    expect(second.body.plan.responses).toHaveLength(1);
    expect(second.body.plan.responses[0].response).toBe('meet_later');
    expect(second.body.plan.meetupRecommendation.micId).toBe(String(micTwo._id));
  });

  test('supports suggestion creation, apply, and dismiss', async () => {
    const created = await request(app)
      .post('/api/v1/shared-plans')
      .send({
        plannerName: 'Nina',
        stops: [
          { micId: String(micOne._id), stayMins: 45 },
          { micId: String(micTwo._id), stayMins: 45 }
        ]
      })
      .expect(201);

    const shareId = created.body.shareId;

    const addSuggestion = await request(app)
      .post(`/api/v1/shared-plans/${shareId}/suggestions`)
      .send({
        name: 'Josh',
        type: 'add_stop',
        proposedMicId: String(micThree._id),
        note: 'Could catch this after Prime Time'
      })
      .expect(201);

    expect(addSuggestion.body.plan.suggestions).toHaveLength(1);
    expect(addSuggestion.body.plan.suggestions[0].status).toBe('open');

    const addSuggestionId = addSuggestion.body.plan.suggestions[0].id;
    const applied = await request(app)
      .post(`/api/v1/shared-plans/${shareId}/suggestions/${addSuggestionId}/apply`)
      .send({ name: 'Maya' })
      .expect(200);

    expect(applied.body.revision).toBe(2);
    expect(applied.body.plan.stops).toHaveLength(3);
    expect(applied.body.plan.suggestions[0].status).toBe('applied');

    const meetupSuggestion = await request(app)
      .post(`/api/v1/shared-plans/${shareId}/suggestions`)
      .send({
        name: 'Ava',
        type: 'set_meetup',
        targetMicId: String(micTwo._id)
      })
      .expect(201);

    const meetupSuggestionId = meetupSuggestion.body.plan.suggestions.find((entry) => entry.status === 'open').id;
    const dismissed = await request(app)
      .post(`/api/v1/shared-plans/${shareId}/suggestions/${meetupSuggestionId}/dismiss`)
      .send({ name: 'Maya' })
      .expect(200);

    const dismissedSuggestion = dismissed.body.plan.suggestions.find((entry) => entry.id === meetupSuggestionId);
    expect(dismissedSuggestion.status).toBe('dismissed');
    expect(dismissed.body.revision).toBe(2);
  });

  test('rejects malformed mic snapshots on create', async () => {
    const response = await request(app)
      .post('/api/v1/shared-plans')
      .send({
        plannerName: 'Jared',
        stops: [
          {
            micId: 'dynamic-slot-1',
            stayMins: 30,
            micSnapshot: {
              id: 'dynamic-slot-1',
              venueName: 'Pop-Up Room',
              lat: 'not-a-number',
              lng: -73.94
            }
          }
        ]
      })
      .expect(400);

    expect(response.body.error).toMatch(/micSnapshot\.lat must be a finite number/i);
  });

  test('rejects invalid stop payloads on create', async () => {
    const response = await request(app)
      .post('/api/v1/shared-plans')
      .send({
        plannerName: 'Alex',
        stops: [
          {
            micId: String(micOne._id),
            stayMins: 10
          }
        ]
      })
      .expect(400);

    expect(response.body.error).toMatch(/stayMins must be between 15 and 240/i);
  });

  test('rejects disallowed shared-plan base URLs', async () => {
    const appBaseResponse = await request(app)
      .post('/api/v1/shared-plans')
      .send({
        plannerName: 'Alex',
        appBaseUrl: 'https://evil.example.com/',
        stops: [{ micId: String(micOne._id), stayMins: 45 }]
      })
      .expect(400);

    const apiBaseResponse = await request(app)
      .post('/api/v1/shared-plans')
      .send({
        plannerName: 'Alex',
        apiBaseUrl: 'https://evil.example.com/api',
        stops: [{ micId: String(micOne._id), stayMins: 45 }]
      })
      .expect(400);

    expect(appBaseResponse.body.error).toMatch(/appBaseUrl host is not allowed/i);
    expect(apiBaseResponse.body.error).toMatch(/apiBaseUrl host is not allowed/i);
  });

  test('rejects invalid shared-plan ids before loading', async () => {
    const response = await request(app)
      .get('/api/v1/shared-plans/not valid!')
      .expect(400);

    expect(response.body.error).toBe('Invalid shareId');
  });

  test('rejects malformed suggestion snapshots', async () => {
    const created = await request(app)
      .post('/api/v1/shared-plans')
      .send({
        plannerName: 'Nina',
        stops: [{ micId: String(micOne._id), stayMins: 45 }]
      })
      .expect(201);

    const response = await request(app)
      .post(`/api/v1/shared-plans/${created.body.shareId}/suggestions`)
      .send({
        name: 'Josh',
        type: 'add_stop',
        proposedMicId: 'dynamic-slot-2',
        proposedMicSnapshot: {
          id: 'dynamic-slot-2',
          venueName: 'Popup',
          lat: 40.72,
          lng: 'oops'
        }
      })
      .expect(400);

    expect(response.body.error).toMatch(/micSnapshot\.lng must be a finite number/i);
  });
});
