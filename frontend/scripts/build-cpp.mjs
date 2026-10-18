// Compiles cpp/queue_core.cpp -> bin/queue_core(.exe). Cross-platform.
// Override the compiler with the CXX environment variable (default: g++).
import { spawnSync } from "node:child_process";
import { mkdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const exe = process.platform === "win32" ? "queue_core.exe" : "queue_core";
const src = path.join(root, "cpp", "queue_core.cpp");
const out = path.join(root, "bin", exe);

const mtime = (p) => {
  try {
    return statSync(p).mtimeMs;
  } catch {
    return 0;
  }
};

// Skip if the binary is newer than its sources (pass --force to always rebuild)
const srcTime = Math.max(mtime(src), mtime(path.join(root, "cpp", "json.hpp")));
if (!process.argv.includes("--force") && mtime(out) > srcTime) {
  console.log(`[build:cpp] bin/${exe} is up to date`);
  process.exit(0);
}

mkdirSync(path.dirname(out), { recursive: true });
const cxx = process.env.CXX || "g++";
const args = ["-O2", "-std=c++17", src, "-o", out];
// Static runtime on Windows so the .exe does not need MinGW DLLs on PATH
if (process.platform === "win32") args.push("-static");

console.log(`[build:cpp] ${cxx} ${args.join(" ")}`);
const r = spawnSync(cxx, args, { stdio: "inherit" });
if (r.error) {
  console.error(`[build:cpp] could not run "${cxx}": ${r.error.message}`);
  console.error("[build:cpp] install g++ or set CXX to your C++ compiler");
  process.exit(1);
}
process.exit(r.status ?? 1);
