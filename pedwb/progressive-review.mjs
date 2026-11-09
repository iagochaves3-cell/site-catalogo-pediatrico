// A reviewed reading block never authorizes an automated prescription.
export function eligibleReview(block, topicNumber) {
  return !!block && Number.isInteger(block.topicNumber) && block.topicNumber >= 1 && block.topicNumber <= 330 && block.topicNumber === topicNumber &&
    typeof block.humanReview === 'boolean' &&
    block.status === 'reviewed_for_scope' && block.automatedPrescribing === false &&
    typeof block.scope === 'string' && block.scope.trim().length > 10 &&
    typeof block.text === 'string' && block.text.trim().length > 50 &&
    typeof block.contentSha256 === 'string' && /^[a-f0-9]{64}$/.test(block.contentSha256) &&
    typeof block.reviewSha256 === 'string' && /^[a-f0-9]{64}$/.test(block.reviewSha256) &&
    new RegExp('^##\\s+' + block.topicNumber + '\\.\\s', 'm').test(block.text) &&
    typeof block.reviewedAt === 'string' && Number.isFinite(Date.parse(block.reviewedAt)) &&
    Array.isArray(block.sources) && block.sources.length >= 1 &&
    block.sources.every(s => s && /^https:\/\//.test(s.url)) &&
    ['clinical', 'pharmaceutical', 'mathematical', 'reverse'].every(k => block.checks?.[k] === 'passed');
}

export function reviewPayload(block) {
  const {reviewSha256, ...payload} = block;
  const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
  return JSON.stringify(canonical(payload));
}

export async function verifiedReviews(data, digest) {
  const blocks = Array.isArray(data?.blocks) ? data.blocks.filter(b => b && typeof b === 'object') : [];
  const result = new Map();
  const duplicates = new Set(blocks.filter((b,i) => blocks.findIndex(x => x.topicNumber === b.topicNumber) !== i).map(b=>b.topicNumber));
  for (const block of blocks) {
    if (duplicates.has(block.topicNumber) || !eligibleReview(block, block.topicNumber)) continue;
    if (await digest(block.text) !== block.contentSha256) continue;
    if (await digest(reviewPayload(block)) !== block.reviewSha256) continue;
    result.set(block.topicNumber, block);
  }
  return result;
}
