// Builds what the installer carries next to the app: a pinned Node runtime and
// a production copy of the API. Output: src-tauri/resources (git-ignored).
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const desktopDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const cacheDir = join(desktopDir, '.cache');
const resourcesDir = join(desktopDir, 'src-tauri', 'resources');
const runtimeDir = join(resourcesDir, 'runtime');
const apiDir = join(resourcesDir, 'api');

const NODE_VERSION = '24.19.0';
/** From https://nodejs.org/dist/v24.19.0/SHASUMS256.txt */
const NODE_ARCHIVES = {
  'win32-x64': {
    name: `node-v${NODE_VERSION}-win-x64`,
    sha256: '57f71ab3652e797d84acddc79c81cc9ff1c6ddb2a1974cdb83f00fee9bff4c73',
  },
};

/** Only what the API needs to run. A deploy also copies `.env`, tests and sources. */
const API_FILES = [
  'dist',
  'node_modules',
  'package.json',
  'prisma',
  'prisma.config.ts',
];

const pnpm = (...args) =>
  execFileSync('pnpm', args, { stdio: 'inherit', shell: true });

const sha256 = (path) =>
  createHash('sha256').update(readFileSync(path)).digest('hex');

async function downloadNodeArchive({ name, sha256: expected }) {
  const archive = join(cacheDir, `${name}.zip`);
  if (existsSync(archive) && sha256(archive) === expected) return archive;

  const url = `https://nodejs.org/dist/v${NODE_VERSION}/${name}.zip`;
  console.log(`Downloading ${url}`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(archive, Buffer.from(await response.arrayBuffer()));

  const actual = sha256(archive);
  if (actual !== expected) {
    rmSync(archive);
    throw new Error(`${name}.zip has checksum ${actual}, expected ${expected}`);
  }
  return archive;
}

async function prepareRuntime() {
  const target = `${process.platform}-${process.arch}`;
  const node = NODE_ARCHIVES[target];
  if (!node) throw new Error(`No pinned Node runtime for ${target}`);

  const archive = await downloadNodeArchive(node);
  const scratch = mkdtempSync(join(tmpdir(), 'mimir-node-'));
  try {
    // Windows' own tar reads zip files; a tar earlier in PATH may not.
    const tar = join(process.env.SystemRoot, 'System32', 'tar.exe');
    execFileSync(tar, [
      '-xf',
      archive,
      '-C',
      scratch,
      `${node.name}/node.exe`,
      `${node.name}/LICENSE`,
    ]);
    mkdirSync(runtimeDir, { recursive: true });
    cpSync(join(scratch, node.name), runtimeDir, { recursive: true });
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

/** Source maps and type declarations do nothing at run time. */
const shipped = (path) => {
  const name = basename(path);
  return !(
    name.startsWith('.env') ||
    name.endsWith('.map') ||
    name.endsWith('.d.ts') ||
    name.endsWith('.tsbuildinfo')
  );
};

function assertNoEnvFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) assertNoEnvFiles(path);
    else if (entry.name.startsWith('.env')) {
      throw new Error(`Refusing to package ${path}`);
    }
  }
}

function prepareApi() {
  pnpm('--filter', '@mimir/api', 'build');

  const scratch = mkdtempSync(join(tmpdir(), 'mimir-api-'));
  try {
    const deployed = join(scratch, 'api');
    // A hoisted tree keeps paths short: an installer has path length limits.
    pnpm(
      '--filter',
      '@mimir/api',
      'deploy',
      '--prod',
      '--config.node-linker=hoisted',
      '--config.force-legacy-deploy=true',
      `"${deployed}"`,
    );
    mkdirSync(apiDir, { recursive: true });
    for (const file of API_FILES) {
      cpSync(join(deployed, file), join(apiDir, file), {
        recursive: true,
        filter: shipped,
      });
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
  assertNoEnvFiles(apiDir);
}

rmSync(resourcesDir, { recursive: true, force: true });
await prepareRuntime();
prepareApi();

const version = execFileSync(join(runtimeDir, 'node.exe'), ['--version'])
  .toString()
  .trim();
if (version !== `v${NODE_VERSION}`) {
  throw new Error(`Packaged Node is ${version}, expected v${NODE_VERSION}`);
}
console.log(`Runtime ready: Node ${version}, API in ${apiDir}`);
