import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to reliably map Node's process.platform to Rust target triple
function getTargetTriple() {
  const platform = process.platform;
  const arch = process.arch;

  // Most common triple mapping for Tauri's auto-resolver
  let triple = '';

  if (platform === 'win32') {
    triple = arch === 'arm64' ? 'aarch64-pc-windows-msvc' : 'x86_64-pc-windows-msvc';
  } else if (platform === 'darwin') {
    triple = arch === 'arm64' ? 'aarch64-apple-darwin' : 'x86_64-apple-darwin';
  } else if (platform === 'linux') {
    triple = arch === 'arm64' ? 'aarch64-unknown-linux-gnu' : 'x86_64-unknown-linux-gnu';
  } else {
    throw new Error(`Unsupported platform: ${platform} ${arch}`);
  }

  // Tauri uses standard toolchains, we can check via rustc if available
  try {
    const rustcOutput = execSync('rustc -vV', { encoding: 'utf8' });
    const match = rustcOutput.match(/host: (.+)/);
    if (match && match[1]) {
      return match[1].trim();
    }
  } catch (e) {
    console.warn(`rustc not found or failed, falling back to manual triple: ${triple}`);
  }

  return triple;
}

const targetTriple = getTargetTriple();
console.log(`Resolved target triple: ${targetTriple}`);

// Calculate paths
const rootDir = path.resolve(__dirname, '../../..');
const backendDistApp = path.resolve(rootDir, 'apps/backend/dist/app');
const tauriBinariesDir = path.resolve(__dirname, '../src-tauri/binaries');

const backendDistAppExe = process.platform === 'win32' ? `${backendDistApp}.exe` : backendDistApp;
const finalDest = path.resolve(tauriBinariesDir, `qsar-backend-${targetTriple}${process.platform === 'win32' ? '.exe' : ''}`);

if (!fs.existsSync(backendDistAppExe)) {
  console.error(`\n[ERROR] Backend PyInstaller binary not found at:\n  ${backendDistAppExe}\n`);
  console.error(`Please run 'turbo run build -F backend' (or 'make build' at the root) first.\n`);
  process.exit(1);
}

// Ensure binaries directory exists
if (!fs.existsSync(tauriBinariesDir)) {
  fs.mkdirSync(tauriBinariesDir, { recursive: true });
}

// Copy the file
console.log(`Copying sidecar:`);
console.log(`  Source: ${backendDistAppExe}`);
console.log(`  Dest  : ${finalDest}`);

fs.copyFileSync(backendDistAppExe, finalDest);

// Make it executable (Linux/macOS)
if (process.platform !== 'win32') {
  fs.chmodSync(finalDest, 0o755);
}

console.log(`Successfully synced sidecar for Tauri bundling.\n`);
