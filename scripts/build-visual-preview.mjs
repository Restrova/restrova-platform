import { copyFile, lstat, mkdir, realpath, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = await realpath(fileURLToPath(new URL("../", import.meta.url)));
const distributionRoot = path.join(repositoryRoot, "dist");
const outputDirectory = path.join(distributionRoot, "visual-preview");

// Keep this list explicit: the public preview must never copy application code,
// environment files, databases or runtime data into its published directory.
const files = [
  ["03-frontend/visual-preview/index.html", "index.html"],
  ["03-frontend/visual-preview/styles.css", "styles.css"],
  ["03-frontend/visual-preview/preview.js", "preview.js"],
  ["docs/design/previews/home-ar.png", "assets/home-ar.png"],
  ["docs/design/previews/login-en.png", "assets/login-en.png"],
  ["docs/design/previews/login-ar.png", "assets/login-ar.png"],
  ["docs/design/previews/login-mobile.png", "assets/login-mobile.png"],
  ["docs/design/previews/workspace.png", "assets/workspace.png"],
  ["03-frontend/web/public/images/restrova/brand-hero.webp", "assets/brand-hero.webp"],
  ["03-frontend/web/public/brand-mark.svg", "assets/brand-mark.svg"],
  ["03-frontend/web/public/fonts/barlow-condensed-800.ttf", "assets/barlow-condensed-800.ttf"],
  ["03-frontend/web/public/fonts/BarlowCondensed-OFL.txt", "assets/BarlowCondensed-OFL.txt"]
];

// Validate every input before replacing any previously built preview.
for (const [source] of files) {
  const sourcePath = path.join(repositoryRoot, source);
  if ((await realpath(sourcePath)) !== sourcePath || !(await lstat(sourcePath)).isFile()) {
    throw new Error(`Preview source must be a regular repository file: ${source}`);
  }
}

for (const directory of [distributionRoot, outputDirectory]) {
  const entry = await lstat(directory).catch((error) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (entry && (!entry.isDirectory() || entry.isSymbolicLink())) {
    throw new Error(`Preview output must be a regular directory: ${directory}`);
  }
}

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(path.join(outputDirectory, "assets"), { recursive: true });

for (const [source, destination] of files) {
  await copyFile(path.join(repositoryRoot, source), path.join(outputDirectory, destination));
}

console.log(`Built visual preview: ${path.relative(repositoryRoot, outputDirectory)} (${files.length} files)`);
