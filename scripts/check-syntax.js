const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const projectRoot = path.resolve(__dirname, "..");
const roots = [path.join(projectRoot, "src"), path.join(projectRoot, "public", "js")];
const files = [];

function collect(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) collect(fullPath);
    if (entry.isFile() && entry.name.endsWith(".js")) files.push(fullPath);
  }
}

for (const root of roots) collect(root);

for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout);
    process.exit(result.status || 1);
  }
}

console.log(`Sintaxe validada em ${files.length} arquivos JavaScript.`);
