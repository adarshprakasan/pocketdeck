import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve, join } from "node:path";

const projectRoot = process.cwd();
const nextCli = resolve(projectRoot, "node_modules/next/dist/bin/next");
const build = spawnSync(process.execPath, [nextCli, "build", "--webpack"], {
  cwd: projectRoot,
  stdio: "inherit",
  env: { ...process.env, NEXT_PUBLIC_SIGNALING_URL: "" },
});

if (build.error) throw build.error;
if (build.status !== 0) process.exit(build.status ?? 1);

const standalone = resolve(projectRoot, ".next/standalone");
const staticFiles = resolve(projectRoot, ".next/static");
await mkdir(join(standalone, ".next"), { recursive: true });
await cp(staticFiles, join(standalone, ".next/static"), { recursive: true, force: true });

try {
  await cp(resolve(projectRoot, "public"), join(standalone, "public"), { recursive: true, force: true });
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

async function removeEnvironmentFiles(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const fullPath = join(directory, entry.name);
    if (entry.name.startsWith(".env")) {
      await rm(fullPath, { recursive: true, force: true });
    } else if (entry.isDirectory()) {
      await removeEnvironmentFiles(fullPath);
    }
  }
}

await removeEnvironmentFiles(standalone);
console.log("Portable build ready in .next/standalone (local environment files excluded).");
