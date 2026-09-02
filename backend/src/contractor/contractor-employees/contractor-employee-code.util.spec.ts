import {
  contractorPrefixCandidates,
  formatContractorEmployeeCode,
} from './contractor-employee-code.util';

describe('contractorPrefixCandidates', () => {
  it('takes the first letter of each word, up to three', () => {
    expect(contractorPrefixCandidates('Sri Balaji Services')[0]).toBe('SBS');
  });

  it('ignores words beyond the third', () => {
    expect(
      contractorPrefixCandidates('Sri Balaji Services Private Limited')[0],
    ).toBe('SBS');
  });

  it('advances only the last character on collision', () => {
    // The leading letters stay put so the code still reads as that contractor;
    // only the final character moves along the last word.
    expect(contractorPrefixCandidates('Sri Balaji Services').slice(0, 3)).toEqual(
      ['SBS', 'SBE', 'SBR'],
    );
  });

  it('separates two contractors that share their initials', () => {
    const a = contractorPrefixCandidates('Sri Balaji Services');
    const b = contractorPrefixCandidates('Sri Balaji Solutions');
    expect(a[0]).toBe(b[0]); // both SBS — this is the collision
    expect(a[1]).toBe('SBE');
    expect(b[1]).toBe('SBO'); // ...and this is what keeps them apart
  });

  it('pads a two-word name from the final word', () => {
    expect(contractorPrefixCandidates('Vedha Entech')[0]).toBe('VEN');
  });

  it('pads a one-word name rather than emitting a single letter', () => {
    expect(contractorPrefixCandidates('Reliance')[0]).toBe('REL');
  });

  it('strips punctuation and digits before taking letters', () => {
    expect(contractorPrefixCandidates('S.R.I. Balaji & Co')[0]).toBe('SBC');
  });

  it('uppercases regardless of input casing', () => {
    expect(contractorPrefixCandidates('sri balaji services')[0]).toBe('SBS');
  });

  it('never repeats a candidate', () => {
    const c = contractorPrefixCandidates('Aa Bb Sss');
    expect(new Set(c).size).toBe(c.length);
  });

  it('still yields a prefix when the last word is too short to pad', () => {
    // "Ab Cd" cannot give three characters from "Cd" alone; fall back rather
    // than return nothing, which would produce a bare numeric code.
    expect(contractorPrefixCandidates('Ab Cd')[0]).toHaveLength(3);
  });

  it('returns nothing for a name with no letters, rather than a bare number', () => {
    expect(contractorPrefixCandidates('123 456')).toEqual([]);
    expect(contractorPrefixCandidates('')).toEqual([]);
  });

  it('runs out of candidates rather than looping forever', () => {
    // A short last word gives only as many variants as it has letters.
    expect(contractorPrefixCandidates('Sri Balaji Co').length).toBeLessThan(3);
  });
});

describe('formatContractorEmployeeCode', () => {
  it('pads the sequence to four digits', () => {
    expect(formatContractorEmployeeCode('SBS', 1)).toBe('SBS0001');
    expect(formatContractorEmployeeCode('SBS', 42)).toBe('SBS0042');
  });

  it('does not truncate a sequence that outgrows the padding', () => {
    expect(formatContractorEmployeeCode('SBS', 12345)).toBe('SBS12345');
  });
});
