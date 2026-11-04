import {
  CURRENT_SCENE_SCHEMA_VERSION,
  createCanvasSchema,
  listCanvasesQuerySchema,
  saveSceneSchema,
  sceneSchema,
  updateCanvasSchema,
} from './canvases.js';

const ASSET_ID = '00000000-0000-4000-8000-000000000001';
const element = { id: 'a', type: 'rectangle', x: 1.5, groupIds: ['g'], custom: { nested: true } };

const messages = (result: { error?: { issues: { message: string }[] } }) =>
  result.error?.issues.map((issue) => issue.message);

describe('sceneSchema', () => {
  it('keeps element data verbatim and fills empty sections', () => {
    expect(sceneSchema.parse({ elements: [element] })).toEqual({
      elements: [element],
      appState: {},
      files: {},
    });
  });

  it('requires string ids and types on elements', () => {
    expect(sceneSchema.safeParse({ elements: [{ type: 'text' }] }).success).toBe(false);
    expect(sceneSchema.safeParse({ elements: [{ id: 'a', type: 1 }] }).success).toBe(false);
    expect(sceneSchema.safeParse({}).success).toBe(false);
  });

  it('accepts asset references and rejects embedded images', () => {
    expect(
      sceneSchema.safeParse({
        elements: [],
        files: { f1: { assetId: ASSET_ID, mimeType: 'image/png' } },
      }).success,
    ).toBe(true);

    const embedded = sceneSchema.safeParse({
      elements: [],
      files: { f1: { id: 'f1', dataURL: 'data:image/png;base64,AAAA', mimeType: 'image/png' } },
    });
    expect(messages(embedded)).toEqual([
      'Images must be uploaded as assets, not embedded in the scene',
    ]);
  });

  it('rejects scenes nested too deeply without overflowing the stack', () => {
    let deep: unknown = 'leaf';
    for (let i = 0; i < 100_000; i++) deep = { deep };

    const result = sceneSchema.safeParse({ elements: [{ id: 'a', type: 'x', deep }] });

    expect(messages(result)).toEqual(['Scene is nested too deeply']);
  });

  it('rejects NUL characters in values and keys, which Postgres cannot store', () => {
    const nul = String.fromCharCode(0);
    const inValue = { elements: [{ id: 'a', type: 'text', text: `a${nul}b` }] };
    const inKey = { elements: [{ id: 'a', type: 'text', [`k${nul}`]: 1 }] };

    expect(messages(sceneSchema.safeParse(inValue))).toEqual([
      'Scene contains invalid NUL characters',
    ]);
    expect(messages(sceneSchema.safeParse(inKey))).toEqual([
      'Scene contains invalid NUL characters',
    ]);
  });
});

describe('saveSceneSchema', () => {
  const valid = {
    expectedRevision: 3,
    schemaVersion: CURRENT_SCENE_SCHEMA_VERSION,
    scene: { elements: [element] },
  };

  it('requires the compare-and-swap fields', () => {
    expect(saveSceneSchema.safeParse(valid).success).toBe(true);
    expect(saveSceneSchema.safeParse({ ...valid, expectedRevision: undefined }).success).toBe(false);
    expect(saveSceneSchema.safeParse({ ...valid, expectedRevision: -1 }).success).toBe(false);
    expect(saveSceneSchema.safeParse({ ...valid, scene: undefined }).success).toBe(false);
  });

  it('rejects schema versions other than the current one', () => {
    const result = saveSceneSchema.safeParse({ ...valid, schemaVersion: 2 });

    expect(messages(result)).toEqual(['Unsupported scene schema version']);
  });
});

describe('canvas metadata schemas', () => {
  it('creates an untitled free canvas with an empty scene by default', () => {
    expect(createCanvasSchema.parse({})).toEqual({
      title: 'Untitled',
      projectId: null,
      schemaVersion: CURRENT_SCENE_SCHEMA_VERSION,
      scene: { elements: [], appState: {}, files: {} },
    });
  });

  it('only lets PATCH change title and project', () => {
    expect(updateCanvasSchema.parse({ title: ' Ideas ' })).toEqual({ title: 'Ideas' });
    expect(updateCanvasSchema.parse({ projectId: null })).toEqual({ projectId: null });
    expect(updateCanvasSchema.safeParse({}).success).toBe(false);
    expect(updateCanvasSchema.safeParse({ scene: { elements: [] } }).success).toBe(false);
    expect(updateCanvasSchema.safeParse({ revision: 9 }).success).toBe(false);
  });

  it('parses list filters', () => {
    expect(listCanvasesQuerySchema.parse({ projectId: 'none', q: ' map ' })).toEqual({
      projectId: 'none',
      q: 'map',
      archived: 'exclude',
    });
    expect(listCanvasesQuerySchema.safeParse({ projectId: 'abc' }).success).toBe(false);
  });
});
