import { pickBestPhoto } from './facedesk-photo-pick.util';

describe('pickBestPhoto', () => {
  it('takes the highest-scoring frame, not the first', () => {
    // The shape that matters: the first frame to clear the gates is the worst
    // of the burst, and it is what the old .find() returned.
    const frames = [
      { photoB64: 'first', qualityScore: 0.51 },
      { photoB64: 'middle', qualityScore: 0.72 },
      { photoB64: 'best', qualityScore: 0.94 },
    ];
    expect(pickBestPhoto(frames)).toBe('best');
  });

  it('ignores frames that carry no photo', () => {
    const frames = [
      { qualityScore: 0.99 },
      { photoB64: 'only-one', qualityScore: 0.4 },
    ];
    expect(pickBestPhoto(frames)).toBe('only-one');
  });

  it('treats an empty photo string as no photo', () => {
    const frames = [
      { photoB64: '', qualityScore: 0.99 },
      { photoB64: 'real', qualityScore: 0.4 },
    ];
    expect(pickBestPhoto(frames)).toBe('real');
  });

  it('keeps insertion order when nothing is scored', () => {
    // A client that sends no qualityScore must behave exactly as before,
    // otherwise this becomes a silent behaviour change on older kiosks.
    const frames = [{ photoB64: 'a' }, { photoB64: 'b' }, { photoB64: 'c' }];
    expect(pickBestPhoto(frames)).toBe('a');
  });

  it('keeps insertion order on a tie', () => {
    const frames = [
      { photoB64: 'a', qualityScore: 0.8 },
      { photoB64: 'b', qualityScore: 0.8 },
    ];
    expect(pickBestPhoto(frames)).toBe('a');
  });

  it('never lets an unscored frame outrank a scored one', () => {
    const frames = [
      { photoB64: 'unscored' },
      { photoB64: 'scored', qualityScore: 0.05 },
    ];
    expect(pickBestPhoto(frames)).toBe('scored');
  });

  it('ignores a non-finite score rather than propagating NaN', () => {
    const frames = [
      { photoB64: 'nan', qualityScore: Number.NaN },
      { photoB64: 'real', qualityScore: 0.3 },
    ];
    expect(pickBestPhoto(frames)).toBe('real');
  });

  it('prefers the requested sample type over a higher-scoring other type', () => {
    // Enrolment shows this photo to a human comparing faces in the duplicate
    // queue, so a front portrait beats a better-scoring turned head.
    const frames = [
      { photoB64: 'left', qualityScore: 0.99, sampleType: 'LEFT' as const },
      { photoB64: 'front', qualityScore: 0.6, sampleType: 'FRONT' as const },
    ];
    expect(pickBestPhoto(frames, 'FRONT')).toBe('front');
  });

  it('picks the best FRONT when there are several', () => {
    const frames = [
      { photoB64: 'front-weak', qualityScore: 0.55, sampleType: 'FRONT' as const },
      { photoB64: 'front-strong', qualityScore: 0.9, sampleType: 'FRONT' as const },
    ];
    expect(pickBestPhoto(frames, 'FRONT')).toBe('front-strong');
  });

  it('falls back to any frame when the preferred type has no photo', () => {
    const frames = [
      { photoB64: 'left', qualityScore: 0.7, sampleType: 'LEFT' as const },
      { qualityScore: 0.99, sampleType: 'FRONT' as const },
    ];
    expect(pickBestPhoto(frames, 'FRONT')).toBe('left');
  });

  it('returns null for empty, missing and photoless input', () => {
    expect(pickBestPhoto([])).toBeNull();
    expect(pickBestPhoto(undefined)).toBeNull();
    expect(pickBestPhoto(null)).toBeNull();
    expect(pickBestPhoto([{ qualityScore: 1 }])).toBeNull();
  });

  it('does not mutate the caller’s array', () => {
    const frames = [
      { photoB64: 'a', qualityScore: 0.1 },
      { photoB64: 'b', qualityScore: 0.9 },
    ];
    pickBestPhoto(frames);
    expect(frames[0].photoB64).toBe('a');
  });
});
