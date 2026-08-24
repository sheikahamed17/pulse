import { describe, it, expect } from 'vitest';
import { matchAccountFromText, type MatchableAccount } from './account-match';

describe('matchAccountFromText', () => {
  it('matches a card account by last-4 digits', () => {
    const accounts: MatchableAccount[] = [
      {
        id: 'acc-1',
        match_hints: '5678',
        is_archived: 0,
        created_at: '2025-01-01T00:00:00Z',
      },
    ];
    const text = 'Spent Rs 500 on HDFC Card XX5678';
    expect(matchAccountFromText(text, accounts)).toBe('acc-1');
  });

  it('matches keyword hints case-insensitively', () => {
    const accounts: MatchableAccount[] = [
      {
        id: 'acc-hdfc',
        match_hints: 'hdfc credit',
        is_archived: 0,
        created_at: '2025-01-01T00:00:00Z',
      },
    ];
    const text = 'Payment via HDFC Credit Card';
    expect(matchAccountFromText(text, accounts)).toBe('acc-hdfc');
  });

  it('returns null when no account matches', () => {
    const accounts: MatchableAccount[] = [
      {
        id: 'acc-1',
        match_hints: 'axis card',
        is_archived: 0,
        created_at: '2025-01-01T00:00:00Z',
      },
    ];
    const text = 'Payment via HDFC Credit Card';
    expect(matchAccountFromText(text, accounts)).toBeNull();
  });

  it('skips archived accounts even if their hints match', () => {
    const accounts: MatchableAccount[] = [
      {
        id: 'acc-archived',
        match_hints: '5678',
        is_archived: 1,
        created_at: '2025-01-01T00:00:00Z',
      },
      {
        id: 'acc-active',
        match_hints: 'axis',
        is_archived: 0,
        created_at: '2025-01-02T00:00:00Z',
      },
    ];
    const text = 'Payment on card XX5678 and axis';
    expect(matchAccountFromText(text, accounts)).toBe('acc-active');
  });

  it('skips deleted accounts even if their hints match', () => {
    const accounts: MatchableAccount[] = [
      {
        id: 'acc-deleted',
        match_hints: '5678',
        is_archived: 0,
        deleted_at: '2025-01-01T00:00:00Z',
        created_at: '2024-12-01T00:00:00Z',
      },
      {
        id: 'acc-active',
        match_hints: 'axis',
        is_archived: 0,
        created_at: '2025-01-02T00:00:00Z',
      },
    ];
    const text = 'Payment on card XX5678 and axis';
    expect(matchAccountFromText(text, accounts)).toBe('acc-active');
  });

  it('returns null when match_hints is null', () => {
    const accounts: MatchableAccount[] = [
      {
        id: 'acc-1',
        match_hints: null,
        is_archived: 0,
        created_at: '2025-01-01T00:00:00Z',
      },
    ];
    const text = 'Spent Rs 500 on HDFC Card XX5678';
    expect(matchAccountFromText(text, accounts)).toBeNull();
  });

  it('returns null when match_hints is empty', () => {
    const accounts: MatchableAccount[] = [
      {
        id: 'acc-1',
        match_hints: '',
        is_archived: 0,
        created_at: '2025-01-01T00:00:00Z',
      },
    ];
    const text = 'Spent Rs 500 on HDFC Card XX5678';
    expect(matchAccountFromText(text, accounts)).toBeNull();
  });

  it('ignores 1-char tokens', () => {
    const accounts: MatchableAccount[] = [
      {
        id: 'acc-1',
        match_hints: '5',
        is_archived: 0,
        created_at: '2025-01-01T00:00:00Z',
      },
    ];
    const text = 'Payment on 5678';
    expect(matchAccountFromText(text, accounts)).toBeNull();
  });

  it('returns the first matching account in stable order (created_at ascending)', () => {
    const accounts: MatchableAccount[] = [
      {
        id: 'acc-2',
        match_hints: 'hdfc',
        is_archived: 0,
        created_at: '2025-01-02T00:00:00Z',
      },
      {
        id: 'acc-1',
        match_hints: 'hdfc',
        is_archived: 0,
        created_at: '2025-01-01T00:00:00Z',
      },
    ];
    const text = 'Payment via HDFC';
    expect(matchAccountFromText(text, accounts)).toBe('acc-1');
  });

  it('preserves input order when created_at is not present', () => {
    const accounts: MatchableAccount[] = [
      {
        id: 'acc-first',
        match_hints: 'hdfc',
        is_archived: 0,
      },
      {
        id: 'acc-second',
        match_hints: 'hdfc',
        is_archived: 0,
      },
    ];
    const text = 'Payment via HDFC';
    expect(matchAccountFromText(text, accounts)).toBe('acc-first');
  });

  it('splits hints on comma and newline', () => {
    const accounts: MatchableAccount[] = [
      {
        id: 'acc-multi',
        match_hints: 'hdfc,axis\nciti',
        is_archived: 0,
        created_at: '2025-01-01T00:00:00Z',
      },
    ];
    expect(matchAccountFromText('Payment via axis', accounts)).toBe('acc-multi');
    expect(matchAccountFromText('Payment via citi', accounts)).toBe('acc-multi');
  });

  it('does not mutate input array', () => {
    const accounts: MatchableAccount[] = [
      {
        id: 'acc-2',
        match_hints: 'hdfc',
        is_archived: 0,
        created_at: '2025-01-02T00:00:00Z',
      },
      {
        id: 'acc-1',
        match_hints: 'axis',
        is_archived: 0,
        created_at: '2025-01-01T00:00:00Z',
      },
    ];
    const originalOrder = accounts.map((a) => a.id);
    matchAccountFromText('Payment via hdfc', accounts);
    const afterOrder = accounts.map((a) => a.id);
    expect(originalOrder).toEqual(afterOrder);
  });

  it('trims whitespace from tokens', () => {
    const accounts: MatchableAccount[] = [
      {
        id: 'acc-1',
        match_hints: '  hdfc  ,  credit  ',
        is_archived: 0,
        created_at: '2025-01-01T00:00:00Z',
      },
    ];
    expect(matchAccountFromText('Payment via HDFC', accounts)).toBe('acc-1');
    expect(matchAccountFromText('via credit', accounts)).toBe('acc-1');
  });
});
