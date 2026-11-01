import {
  createTicketSchema,
  formatTicketCode,
  listTicketsQuerySchema,
  parseTicketCode,
  updateTicketSchema,
} from './tickets.js';

const paths = (result: { error?: { issues: { path: PropertyKey[] }[] } }) =>
  result.error?.issues.map((issue) => issue.path.join('.'));

describe('ticket codes', () => {
  it.each([
    ['SB', 1, 'SB-001'],
    ['SB', 42, 'SB-042'],
    ['MIM', 1000, 'MIM-1000'],
  ])('formats %s #%i as %s', (key, number, code) => {
    expect(formatTicketCode(key, number)).toBe(code);
  });

  it('parses codes case-insensitively', () => {
    expect(parseTicketCode(' sb-007 ')).toEqual({ key: 'SB', number: 7 });
    expect(parseTicketCode('MIM-1000')).toEqual({ key: 'MIM', number: 1000 });
  });

  it('accepts the largest number the database can store', () => {
    expect(parseTicketCode('SB-2147483647')).toEqual({
      key: 'SB',
      number: 2147483647,
    });
  });

  it.each(['SB', 'SB-', 'SB-0', 'SB-x1', '1B-001', 'not a code', 'SB-2147483648'])(
    'rejects %j',
    (text) => {
      expect(parseTicketCode(text)).toBeNull();
    },
  );
});

describe('createTicketSchema', () => {
  it('fills defaults', () => {
    expect(createTicketSchema.parse({ title: ' Fix login ' })).toEqual({
      title: 'Fix login',
      descriptionJson: null,
      descriptionText: '',
      type: 'task',
      status: 'backlog',
      priority: 'none',
      dueAt: null,
    });
  });

  it('accepts every documented type, status and priority', () => {
    for (const type of ['task', 'bug', 'feature', 'improvement']) {
      expect(createTicketSchema.safeParse({ title: 'x', type }).success).toBe(true);
    }
    for (const status of ['backlog', 'todo', 'in_progress', 'in_review', 'done', 'canceled']) {
      expect(createTicketSchema.safeParse({ title: 'x', status }).success).toBe(true);
    }
    for (const priority of ['none', 'low', 'medium', 'high', 'urgent']) {
      expect(createTicketSchema.safeParse({ title: 'x', priority }).success).toBe(true);
    }
  });

  it('rejects invalid values with their paths', () => {
    const result = createTicketSchema.safeParse({
      title: '',
      type: 'chore',
      status: 'open',
      priority: 'p0',
      dueAt: 'tomorrow',
      descriptionJson: 'not an object',
    });

    expect(paths(result)).toEqual([
      'title',
      'descriptionJson',
      'type',
      'status',
      'priority',
      'dueAt',
    ]);
  });

  it('rejects fields owned by other tickets or by the server', () => {
    for (const field of ['number', 'projectId', 'parentId', 'epicId', 'sortOrder']) {
      expect(createTicketSchema.safeParse({ title: 'x', [field]: 1 }).success).toBe(false);
    }
  });
});

describe('updateTicketSchema', () => {
  it('accepts a partial update and clearing the due date', () => {
    expect(updateTicketSchema.parse({ status: 'done', dueAt: null })).toEqual({
      status: 'done',
      dueAt: null,
    });
  });

  it('refuses an empty update', () => {
    expect(paths(updateTicketSchema.safeParse({}))).toEqual(['']);
  });
});

describe('listTicketsQuerySchema', () => {
  it('uses position order and hides archived tickets by default', () => {
    expect(listTicketsQuerySchema.parse({})).toEqual({
      archived: 'exclude',
      sort: 'position',
      order: 'asc',
    });
  });

  it('parses comma-separated lists', () => {
    expect(
      listTicketsQuerySchema.parse({
        status: 'todo,in_progress',
        type: 'bug',
        priority: 'high, urgent',
        sort: 'priority',
        order: 'desc',
      }),
    ).toEqual({
      status: ['todo', 'in_progress'],
      type: ['bug'],
      priority: ['high', 'urgent'],
      archived: 'exclude',
      sort: 'priority',
      order: 'desc',
    });
  });

  it('rejects unknown list values', () => {
    expect(paths(listTicketsQuerySchema.safeParse({ status: 'todo,open' }))).toEqual([
      'status',
    ]);
  });
});
