// Pure validation: no database access and no destructive synchronization.
const SEED_FIELDS = ['endTime', 'borough', 'neighborhood', 'address', 'lat', 'lon', 'location',
  'cost', 'stageTime', 'signUpDetails', 'host', 'environment', 'notes', 'flyerUrl', 'flyerDate'];
const FIELDS = ['name', 'day', 'startTime', 'venueName'];
function identity(row) {
  const parts = FIELDS.map(field => String(row[field] ?? '').trim().replace(/\s+/g, ' ').toLowerCase());
  if (parts.some(part => !part)) throw new Error('Incomplete mic identity');
  return JSON.stringify(parts);
}
function index(rows, label) {
  const result = new Map();
  for (const row of rows) {
    const key = identity(row);
    if (result.has(key)) throw new Error(`Duplicate identity in ${label}: ${key}`);
    result.set(key, row);
  }
  return result;
}
function planSeed(incoming, existing) {
  if (!Array.isArray(incoming) || !incoming.length) throw new Error('Refusing an empty seed');
  const wanted = index(incoming, 'seed');
  const current = index(existing, 'database');
  const missing = [...current.keys()].filter(key => !wanted.has(key));
  if (missing.length) throw new Error(`${missing.length} database identities absent from seed; review removals or schedule changes before syncing`);
  return [...wanted].map(([key, row]) => {
    const previous = current.get(key);
    const { _id, __v, createdAt, updatedAt, ...fields } = row;
    // Retractions are explicit, including when a suspect flyer is removed from JSON.
    for (const field of ['flyerUrl', 'flyerDate']) if (!(field in fields)) fields[field] = null;
    const unset = Object.fromEntries(SEED_FIELDS.filter(field => !(field in fields)).map(field => [field, '']));
    return { updateOne: {
      filter: previous ? { _id: previous._id } : Object.fromEntries(FIELDS.map(field => [field, row[field]])),
      update: { $set: fields, ...(Object.keys(unset).length ? { $unset: unset } : {}) }, upsert: !previous,
    } };
  });
}
module.exports = { identity, planSeed };
