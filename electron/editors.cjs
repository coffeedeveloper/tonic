const { execFile } = require("node:child_process");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);

const editorDefinitions = Object.freeze([
  {
    id: "vscode",
    name: "Visual Studio Code",
    bundleId: "com.microsoft.VSCode",
    appNames: ["Visual Studio Code.app"]
  },
  {
    id: "cursor",
    name: "Cursor",
    bundleId: "com.todesktop.230313mzl4w4u92",
    appNames: ["Cursor.app"]
  },
  {
    id: "zed",
    name: "Zed",
    bundleId: "dev.zed.Zed",
    appNames: ["Zed.app"]
  },
  {
    id: "webstorm",
    name: "WebStorm",
    bundleId: "com.jetbrains.WebStorm",
    appNames: ["WebStorm.app"]
  },
  {
    id: "sublime-text",
    name: "Sublime Text",
    bundleId: "com.sublimetext.4",
    appNames: ["Sublime Text.app"]
  },
  {
    id: "xcode",
    name: "Xcode",
    bundleId: "com.apple.dt.Xcode",
    appNames: ["Xcode.app"]
  },
  {
    id: "terminal",
    name: "Terminal",
    bundleId: "com.apple.Terminal",
    appNames: ["Utilities/Terminal.app"]
  },
  {
    id: "warp",
    name: "Warp",
    bundleId: "dev.warp.Warp-Stable",
    appNames: ["Warp.app"]
  }
]);

const editorById = new Map(editorDefinitions.map((editor) => [editor.id, editor]));

async function isApplicationBundle(candidatePath) {
  if (
    typeof candidatePath !== "string" ||
    candidatePath.length === 0 ||
    candidatePath.length > 8_192 ||
    candidatePath.includes("\0") ||
    !path.isAbsolute(candidatePath) ||
    path.extname(candidatePath).toLowerCase() !== ".app"
  ) {
    return false;
  }

  try {
    const [stats, infoPlistStats] = await Promise.all([
      fs.stat(candidatePath),
      fs.stat(path.join(candidatePath, "Contents", "Info.plist"))
    ]);
    return stats.isDirectory() && infoPlistStats.isFile();
  } catch {
    return false;
  }
}

async function resolveApplicationBundle(candidatePath) {
  if (!(await isApplicationBundle(candidatePath))) {
    return null;
  }

  try {
    const realPath = path.normalize(await fs.realpath(candidatePath));
    return (await isApplicationBundle(realPath)) ? realPath : null;
  } catch {
    return null;
  }
}

function customEditorOption(appPath) {
  return {
    id: "custom",
    name: path.basename(appPath, path.extname(appPath)),
    appPath,
    iconDataUrl: null,
    available: true
  };
}

function fixedApplicationPaths(editor) {
  const roots = [
    "/Applications",
    "/System/Applications",
    path.join(os.homedir(), "Applications")
  ];

  return roots.flatMap((root) => editor.appNames.map((name) => path.join(root, name)));
}

async function findWithSpotlight(bundleId) {
  if (process.platform !== "darwin") {
    return null;
  }

  try {
    const { stdout } = await execFileAsync(
      "/usr/bin/mdfind",
      [`kMDItemCFBundleIdentifier == '${bundleId}'`],
      {
        encoding: "utf8",
        maxBuffer: 512 * 1024,
        timeout: 4_000
      }
    );

    for (const candidatePath of stdout.split("\n").map((value) => value.trim())) {
      if (candidatePath && (await isApplicationBundle(candidatePath))) {
        return candidatePath;
      }
    }
  } catch {
    // Spotlight may be disabled. Fixed application paths remain a reliable fallback.
  }

  return null;
}

async function findEditorApplication(editor) {
  for (const candidatePath of fixedApplicationPaths(editor)) {
    if (await isApplicationBundle(candidatePath)) {
      return candidatePath;
    }
  }

  return findWithSpotlight(editor.bundleId);
}

async function detectEditors(customEditorPath = null) {
  const [detected, finderPath] = await Promise.all([
    Promise.all(editorDefinitions.map(async (editor) => {
      const appPath = await findEditorApplication(editor);
      return {
        id: editor.id,
        name: editor.name,
        appPath,
        iconDataUrl: null,
        available: Boolean(appPath)
      };
    })),
    process.platform === "darwin"
      ? resolveApplicationBundle("/System/Library/CoreServices/Finder.app")
      : Promise.resolve(null)
  ]);
  const preferred = detected.find((editor) => editor.available);
  const installed = detected.filter((editor) => editor.available);
  const resolvedCustomEditorPath = customEditorPath
    ? await resolveApplicationBundle(customEditorPath)
    : null;

  return [
    {
      id: "auto",
      name: preferred ? `Auto · ${preferred.name}` : "Auto-detect",
      appPath: preferred?.appPath ?? null,
      iconDataUrl: null,
      available: true
    },
    {
      id: "system",
      name: "Finder / system default",
      appPath: finderPath,
      iconDataUrl: null,
      available: true
    },
    ...installed,
    ...(resolvedCustomEditorPath ? [customEditorOption(resolvedCustomEditorPath)] : [])
  ];
}

function isKnownEditorId(value) {
  return value === "auto" || value === "system" || value === "custom" || editorById.has(value);
}

async function openDirectoryWithEditor(settings, directoryPath, editorIdOverride = null) {
  const editorId = editorIdOverride ?? settings?.editorId;
  if (!isKnownEditorId(editorId)) {
    throw new Error("Unknown editor selection.");
  }

  const args = [];
  if (editorId === "custom") {
    const appPath = await resolveApplicationBundle(settings?.customEditorPath);
    if (!appPath) {
      throw new Error("The custom editor is unavailable.");
    }
    args.push("-a", appPath, directoryPath);
    await execFileAsync("/usr/bin/open", args, {
      encoding: "utf8",
      maxBuffer: 128 * 1024,
      timeout: 10_000
    });
    return;
  }

  let definition = editorById.get(editorId);
  if (editorId === "auto") {
    for (const candidate of editorDefinitions) {
      if (await findEditorApplication(candidate)) {
        definition = candidate;
        break;
      }
    }
  }

  if (definition) {
    const appPath = await findEditorApplication(definition);
    if (!appPath) {
      throw new Error(`${definition.name} is not installed.`);
    }
    args.push("-b", definition.bundleId);
  }
  args.push(directoryPath);

  await execFileAsync("/usr/bin/open", args, {
    encoding: "utf8",
    maxBuffer: 128 * 1024,
    timeout: 10_000
  });
}

module.exports = {
  customEditorOption,
  detectEditors,
  editorDefinitions,
  isKnownEditorId,
  openDirectoryWithEditor,
  resolveApplicationBundle
};
