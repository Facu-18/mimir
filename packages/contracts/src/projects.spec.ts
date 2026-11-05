import {
  createProjectSchema,
  listProjectsQuerySchema,
  updateProjectSchema,
} from './projects.js';

function issues(result: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }) {
  return result.error?.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));
}

describe('createProjectSchema', () => {
  it('normalizes the key and fills defaults', () => {
    expect(createProjectSchema.parse({ key: ' sb ', name: ' Second Brain ' })).toEqual({
      key: 'SB',
      name: 'Second Brain',
      description: '',
      icon: null,
      color: null,
      status: 'active',
      isFavorite: false,
      sortOrder: 0,
    });
  });

  it.each(['S', '1AB', 'ABCDEFGHIJK', 'S-B'])('rejects the key %j', (key) => {
    const result = createProjectSchema.safeParse({ key, name: 'X' });

    expect(issues(result)).toEqual([
      {
        path: 'key',
        message:
          'Key must be 2-10 uppercase letters or digits and start with a letter',
      },
    ]);
  });

  it('requires a non-blank name', () => {
    const result = createProjectSchema.safeParse({ key: 'SB', name: '   ' });

    expect(issues(result)).toEqual([{ path: 'name', message: 'Name is required' }]);
  });

  it('rejects the archived status (use the archive endpoint)', () => {
    const result = createProjectSchema.safeParse({
      key: 'SB',
      name: 'X',
      status: 'archived',
    });

    expect(issues(result)?.[0].path).toBe('status');
  });

  it('rejects colors that are not #RRGGBB', () => {
    const result = createProjectSchema.safeParse({ key: 'SB', name: 'X', color: 'red' });

    expect(issues(result)).toEqual([
      { path: 'color', message: 'Color must be a hex value like #81917E' },
    ]);
  });

  it('rejects unknown fields', () => {
    const result = createProjectSchema.safeParse({ key: 'SB', name: 'X', owner: 'me' });

    expect(result.success).toBe(false);
  });
});

describe('updateProjectSchema', () => {
  it('accepts a partial update', () => {
    expect(updateProjectSchema.parse({ isFavorite: true })).toEqual({ isFavorite: true });
  });

  it('refuses to change the key', () => {
    const result = updateProjectSchema.safeParse({ key: 'NEW' });

    expect(issues(result)).toEqual([
      { path: 'key', message: 'Project key cannot be changed' },
    ]);
  });

  it('refuses an empty update', () => {
    const result = updateProjectSchema.safeParse({});

    expect(issues(result)).toEqual([
      { path: '', message: 'At least one field must be provided' },
    ]);
  });
});

describe('listProjectsQuerySchema', () => {
  it('defaults to excluding archived projects', () => {
    expect(listProjectsQuerySchema.parse({})).toEqual({ archived: 'exclude' });
  });

  it('parses query-string values', () => {
    expect(
      listProjectsQuerySchema.parse({
        q: ' brain ',
        status: 'paused',
        isFavorite: 'true',
        archived: 'only',
      }),
    ).toEqual({ q: 'brain', status: 'paused', isFavorite: true, archived: 'only' });
  });

  it('rejects an invalid boolean', () => {
    expect(listProjectsQuerySchema.safeParse({ isFavorite: 'yes' }).success).toBe(false);
  });
});
