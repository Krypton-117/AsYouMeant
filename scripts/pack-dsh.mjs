// SPDX-License-Identifier: MPL-2.0
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export function packDsh(repositoryRoot = resolve(".")) {
  const packageRoot = join(repositoryRoot, "native", "dsh");
  for (const file of ["LICENSE", "THIRD_PARTY_NOTICES.md"]) {
    const read = (path) => readFileSync(path, "utf8").replaceAll("\r\n", "\n").trimEnd();
    if (read(join(repositoryRoot, file)) !== read(join(packageRoot, file))) throw new Error(`DSH ${file} is not synchronized with the repository license notices.`);
  }
  const npmCli = [
    join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js"),
    join(dirname(process.execPath), "..", "node_modules", "npm", "bin", "npm-cli.js")
  ].find(existsSync);
  if (!npmCli) throw new Error("Install Node.js with its bundled npm to package the DSH bundle.");
  const destination = join(repositoryRoot, ".work", "packages");
  mkdirSync(destination, { recursive: true });
  const result = spawnSync(process.execPath, [npmCli, "pack", ".", "--ignore-scripts", "--offline", "--json", "--pack-destination", destination, "--cache", join(repositoryRoot, ".work", "npm-cache")], {
    cwd: packageRoot, encoding: "utf8", timeout: 60000
  });
  if (result.error || result.status !== 0) throw new Error(`DSH package creation failed: ${result.error?.message ?? result.stderr}`);
  const [packed] = JSON.parse(result.stdout);
  const manifest = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
  if (packed?.name !== manifest.name || packed?.version !== manifest.version || packed?.filename !== `${manifest.name}-${manifest.version}.tgz`) throw new Error("npm returned unexpected DSH package identity.");
  return { path: join(destination, packed.filename), name: packed.name, version: packed.version, files: packed.files.map((file) => file.path) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(packDsh(), null, 2));
}
