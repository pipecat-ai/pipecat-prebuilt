import fs from "node:fs";
import path from "node:path";

const LICENSE_FILE = /^(licen[cs]e|copying|notice)(\.|$)/i;
const FALLBACK_DIR = path.join(import.meta.dirname, "licenses");

/**
 * Writes THIRD_PARTY_NOTICES.txt into the build output, listing every npm
 * package bundled into the client with its license. A package that ships no
 * license file gets the standard text from licenses/<SPDX id>.txt, with its
 * copyright line pointing to the package source.
 *
 * `packages` names npm packages the bundle uses without importing them as
 * modules (for example, a stylesheet pulled in through a CSS @import).
 * `vendored` lists third-party code copied into this repository, each with
 * `name`, `license`, `source` and `file` (its license text, relative to this
 * directory).
 */
export default function thirdPartyNotices({ packages = [], vendored = [] } = {}) {
  let root = process.cwd();
  return {
    name: "third-party-notices",
    apply: "build",
    configResolved(config) {
      root = config.root;
    },
    generateBundle(_options, bundle) {
      const roots = new Set();
      for (const output of Object.values(bundle)) {
        for (const id of output.moduleIds ?? []) {
          const pkg = packageRoot(id);
          if (pkg) roots.add(pkg);
        }
        for (const file of output.originalFileNames ?? []) {
          const pkg = packageRoot(path.resolve(root, file));
          if (pkg) roots.add(pkg);
        }
      }

      for (const name of packages) {
        roots.add(path.join(root, "node_modules", name));
      }

      const entries = [
        ...[...roots].map(describe).filter(Boolean),
        ...vendored.map((item) => ({
          name: item.name,
          license: item.license,
          source: item.source,
          text: fs.readFileSync(path.join(import.meta.dirname, item.file), "utf8").trim(),
        })),
      ].sort((a, b) => a.name.localeCompare(b.name));

      const sections = entries.map((pkg) =>
        [
          pkg.version ? `${pkg.name}@${pkg.version}` : pkg.name,
          `License: ${pkg.license}`,
          ...(pkg.source ? [`Source: ${pkg.source}`] : []),
          "",
          pkg.text ?? "(No license text available; see the source above.)",
        ].join("\n"),
      );

      this.emitFile({
        type: "asset",
        fileName: "THIRD_PARTY_NOTICES.txt",
        source:
          "This client bundles the following third-party software.\n\n" +
          sections.join(`\n\n${"-".repeat(80)}\n\n`) +
          "\n",
      });
    },
  };
}

function packageRoot(id) {
  const file = id.replace(/^\0/, "").split("?")[0];
  const marker = `${path.sep}node_modules${path.sep}`;
  const index = file.lastIndexOf(marker);
  if (index === -1) return null;
  const rest = file.slice(index + marker.length).split(path.sep);
  const depth = rest[0].startsWith("@") ? 2 : 1;
  const modulesDir = file.slice(0, index + marker.length);
  return path.join(modulesDir, ...rest.slice(0, depth));
}

function describe(root) {
  const manifestPath = path.join(root, "package.json");
  if (!fs.existsSync(manifestPath)) return null;
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const license =
    typeof manifest.license === "string"
      ? manifest.license
      : (manifest.license?.type ?? "UNKNOWN");
  return {
    name: manifest.name,
    version: manifest.version,
    license,
    source: repositoryUrl(manifest),
    text: licenseText(root, manifest.name, license),
  };
}

function repositoryUrl(manifest) {
  const repo = manifest.repository;
  const url = typeof repo === "string" ? repo : repo?.url;
  return (url ?? manifest.homepage ?? "")
    .replace(/^git\+/, "")
    .replace(/^(github:|git@github\.com:)/, "https://github.com/")
    .replace(/^git:\/\//, "https://")
    .replace(/^([\w.-]+\/[\w.-]+)$/, "https://github.com/$1")
    .replace(/\.git$/, "");
}

function licenseText(root, name, license) {
  const files = fs
    .readdirSync(root)
    .filter((file) => LICENSE_FILE.test(file))
    .sort();
  if (files.length > 0) {
    return files
      .map((file) => fs.readFileSync(path.join(root, file), "utf8").trim())
      .join("\n\n");
  }
  // For "A OR B" one license is enough; for "A AND B" every license applies.
  const ids = (license.match(/[A-Za-z0-9.+-]+/g) ?? []).filter(
    (id) => !["AND", "OR", "WITH"].includes(id),
  );
  const texts = ids
    .map((id) => path.join(FALLBACK_DIR, `${id}.txt`))
    .filter((file) => fs.existsSync(file))
    .map((file) =>
      fs
        .readFileSync(file, "utf8")
        .trim()
        .replace(
          "{{copyright}}",
          `Copyright (c) the ${name} authors; see Source above.`,
        ),
    );
  if (texts.length === 0) return null;
  return license.includes(" OR ") ? texts[0] : texts.join("\n\n");
}
