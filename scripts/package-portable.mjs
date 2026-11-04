import { access, chmod, copyFile, cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

const targets = {
  "windows-x64": { platform: "win32", arch: "x64", archive: "pocketdeck-windows-x64.zip" },
  "macos-intel": { platform: "darwin", arch: "x64", archive: "pocketdeck-macos-intel.zip" },
  "macos-apple-silicon": { platform: "darwin", arch: "arm64", archive: "pocketdeck-macos-apple-silicon.zip" },
};
const targetName = process.argv[2] ?? (process.platform === "win32" ? "windows-x64" : process.arch === "arm64" ? "macos-apple-silicon" : "macos-intel");
const target = targets[targetName];
if (!target) throw new Error(`Unsupported package target: ${targetName}`);
if (target.platform !== process.platform || target.arch !== process.arch) {
  throw new Error(`${targetName} must be packaged on ${target.platform}/${target.arch}; current runtime is ${process.platform}/${process.arch}.`);
}

const projectRoot = process.cwd();
const standalone = resolve(projectRoot, ".next/standalone");
try { await access(join(standalone, "server.js")); }
catch { throw new Error("Portable build is missing. Run npm run build:portable first."); }

const runtimeLicenseCandidates = process.platform === "win32"
  ? [join(dirname(process.execPath), "LICENSE"), join(dirname(process.execPath), "LICENSE.txt")]
  : [join(dirname(process.execPath), "LICENSE"), resolve(dirname(process.execPath), "..", "LICENSE"), resolve(dirname(process.execPath), "..", "..", "LICENSE")];
let runtimeLicense;
for (const candidate of runtimeLicenseCandidates) {
  try { runtimeLicense = await readFile(candidate); break; } catch { /* Try the next Node distribution location. */ }
}
if (!runtimeLicense) throw new Error("Could not locate the bundled Node.js runtime license.");

const outputDirectory = resolve(projectRoot, "dist");
await mkdir(outputDirectory, { recursive: true });
const archivePath = join(outputDirectory, target.archive);
await rm(archivePath, { force: true });
const stagingDirectory = await mkdtemp(join(tmpdir(), "pocketdeck-package-"));
const packageDirectory = join(stagingDirectory, "PocketDeck");
const appDirectory = join(packageDirectory, "app");
const runtimeDirectory = join(packageDirectory, "runtime");

try {
  await mkdir(appDirectory, { recursive: true });
  await mkdir(runtimeDirectory, { recursive: true });
  await cp(standalone, appDirectory, { recursive: true });
  await copyFile(process.execPath, join(runtimeDirectory, process.platform === "win32" ? "node.exe" : "node"));
  if (process.platform !== "win32") await chmod(join(runtimeDirectory, "node"), 0o755);
  await writeFile(join(packageDirectory, "NODE-LICENSE.txt"), runtimeLicense);
  await cp(resolve(projectRoot, "packaging/PORTABLE-README.txt"), join(packageDirectory, "README.txt"));
  await cp(resolve(projectRoot, "packaging/pocketdeck.env.example"), join(packageDirectory, "pocketdeck.env.example"));

  if (process.platform === "win32") {
    await cp(resolve(projectRoot, "packaging/start-pocketdeck.bat"), join(packageDirectory, "Start-PocketDeck.bat"));
    const result = spawnSync("tar", ["-a", "-c", "-f", archivePath, "-C", stagingDirectory, "PocketDeck"], { stdio: "inherit" });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error("Windows zip creation failed.");
  } else {
    const launcherPath = join(packageDirectory, "start-pocketdeck.command");
    await copyFile(resolve(projectRoot, "packaging/start-pocketdeck.command"), launcherPath);
    await chmod(launcherPath, 0o755);
    const result = spawnSync("zip", ["-X", "-q", "-r", archivePath, "PocketDeck"], { cwd: stagingDirectory, stdio: "inherit" });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error("macOS zip creation failed.");
  }
} finally {
  await rm(stagingDirectory, { recursive: true, force: true });
}

console.log(`Created ${archivePath}`);
