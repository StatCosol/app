import { describe, it, expect } from 'vitest';
import {
  INDIAN_STATES,
  STATE_SELECT_OPTIONS,
  stateSelectOptionsWithPlaceholder,
} from './indian-states';

describe('indian-states', () => {
  it('has unique state codes', () => {
    const codes = INDIAN_STATES.map((s) => s.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('derives select options as { label: name, value: code }', () => {
    expect(STATE_SELECT_OPTIONS.length).toBe(INDIAN_STATES.length);
    const mh = STATE_SELECT_OPTIONS.find((o) => o.value === 'MH');
    expect(mh).toEqual({ label: 'Maharashtra', value: 'MH' });
  });

  it('prepends a blank placeholder row', () => {
    const opts = stateSelectOptionsWithPlaceholder();
    expect(opts).toHaveLength(STATE_SELECT_OPTIONS.length + 1);
    expect(opts[0]).toEqual({ label: 'Select state', value: '' });
  });

  it('honours a custom placeholder label', () => {
    expect(stateSelectOptionsWithPlaceholder('Choose a state')[0]).toEqual({
      label: 'Choose a state',
      value: '',
    });
  });
});
