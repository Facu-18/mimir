import { createEpicSchema, listEpicsQuerySchema, updateEpicSchema } from './epics.js';

describe('epic schemas', () => {
  it('fills defaults on create', () => {
    expect(createEpicSchema.parse({ title: ' Onboarding ' })).toEqual({
      title: 'Onboarding',
      description: '',
      status: 'planned',
    });
  });

  it('accepts every epic status and rejects others', () => {
    for (const status of ['planned', 'in_progress', 'done', 'canceled']) {
      expect(createEpicSchema.safeParse({ title: 'x', status }).success).toBe(true);
    }
    expect(createEpicSchema.safeParse({ title: 'x', status: 'archived' }).success).toBe(false);
  });

  it('requires a title and rejects unknown fields', () => {
    expect(createEpicSchema.safeParse({ title: ' ' }).success).toBe(false);
    expect(createEpicSchema.safeParse({ title: 'x', projectId: 'y' }).success).toBe(false);
  });

  it('refuses an empty update', () => {
    expect(updateEpicSchema.safeParse({}).success).toBe(false);
    expect(updateEpicSchema.parse({ status: 'done' })).toEqual({ status: 'done' });
  });

  it('hides archived epics by default', () => {
    expect(listEpicsQuerySchema.parse({})).toEqual({ archived: 'exclude' });
  });
});
