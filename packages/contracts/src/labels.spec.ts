import { createLabelSchema, setTicketLabelsSchema, updateLabelSchema } from './labels.js';

describe('label schemas', () => {
  it('creates a global label with the default color', () => {
    expect(createLabelSchema.parse({ name: ' bug ' })).toEqual({
      name: 'bug',
      color: '#81917E',
      projectId: null,
    });
  });

  it('rejects a blank name, a bad color and a non-UUID project', () => {
    expect(createLabelSchema.safeParse({ name: '' }).success).toBe(false);
    expect(createLabelSchema.safeParse({ name: 'x', color: 'red' }).success).toBe(false);
    expect(createLabelSchema.safeParse({ name: 'x', projectId: 'p' }).success).toBe(false);
  });

  it('does not allow moving a label to another scope', () => {
    expect(updateLabelSchema.safeParse({ projectId: null }).success).toBe(false);
  });

  it('deduplicates label ids when setting a ticket labels', () => {
    const id = '00000000-0000-4000-8000-000000000001';
    expect(setTicketLabelsSchema.parse({ labelIds: [id, id] })).toEqual({ labelIds: [id] });
  });
});
