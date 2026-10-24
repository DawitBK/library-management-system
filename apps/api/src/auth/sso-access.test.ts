import { describe, expect, it } from 'vitest';
import { appRolesClaim, namesFrom, roleFromIdp } from './sso-access.js';

describe('roleFromIdp', () => {
  it('gives the strongest of the roles the provider gave', () => {
    expect(roleFromIdp(['librarian'])).toBe('librarian');
    expect(roleFromIdp(['librarian', 'admin'])).toBe('admin');
  });

  it('ignores case and spaces, and roles that are not ours', () => {
    expect(roleFromIdp([' Admin '])).toBe('admin');
    expect(roleFromIdp(['wizard', 'librarian'])).toBe('librarian');
  });

  it('gives nothing when no role is one of ours, so there is no access', () => {
    expect(roleFromIdp([])).toBeUndefined();
    expect(roleFromIdp(['wizard', 'owner', 'member'])).toBeUndefined();
  });
});

describe('namesFrom', () => {
  it('uses the provider\'s names, trimmed', () => {
    expect(namesFrom({ roles: [], firstName: ' Abebe ', lastName: 'Kebede ' }, 'a@b.test')).toEqual({ firstName: 'Abebe', lastName: 'Kebede' });
  });

  it('never leaves the first name empty: the address before the @ stands in, and the last name may be empty', () => {
    expect(namesFrom({ roles: [] }, 'abebe.k@library.test')).toEqual({ firstName: 'abebe.k', lastName: '' });
    expect(namesFrom({ roles: [], firstName: '  ', lastName: 'Kebede' }, 'abebe@library.test')).toEqual({ firstName: 'abebe', lastName: 'Kebede' });
  });
});

describe('appRolesClaim', () => {
  it('is a list of text when the provider sent one, even an empty list (no access)', () => {
    expect(appRolesClaim(['admin', 'librarian'])).toEqual(['admin', 'librarian']);
    expect(appRolesClaim([])).toEqual([]);
    expect(appRolesClaim(['admin', 3, null, 'librarian'])).toEqual(['admin', 'librarian']);
  });

  it('is undefined when the claim is absent or not a list: the provider does not manage this application', () => {
    expect(appRolesClaim(undefined)).toBeUndefined();
    expect(appRolesClaim('admin')).toBeUndefined();
    expect(appRolesClaim({ 0: 'admin' })).toBeUndefined();
    expect(appRolesClaim(null)).toBeUndefined();
  });
});
