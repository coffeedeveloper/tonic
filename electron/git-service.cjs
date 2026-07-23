const { execFile } = require("node:child_process");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);
const GIT_MAX_BUFFER = 16 * 1024 * 1024;
const UNTRACKED_FILE_MAX_BYTES = 16 * 1024 * 1024;

async function runGit(args, options = {}) {
  const { stdout } = await execFileAsync("/usr/bin/git", args, {
    encoding: "utf8",
    maxBuffer: GIT_MAX_BUFFER,
    timeout: 15_000,
    windowsHide: true,
    ...options
  });

  return stdout;
}

function expandHome(inputPath) {
  if (inputPath === "~") {
    return os.homedir();
  }

  if (inputPath.startsWith(`~${path.sep}`)) {
    return path.join(os.homedir(), inputPath.slice(2));
  }

  return inputPath;
}

async function realpathOrResolved(inputPath) {
  const resolvedPath = path.resolve(expandHome(inputPath));

  try {
    return await fs.realpath(resolvedPath);
  } catch {
    return resolvedPath;
  }
}

async function normalizeGitPath(gitPath, cwd) {
  const absolutePath = path.isAbsolute(gitPath)
    ? gitPath
    : path.resolve(cwd, gitPath);

  return realpathOrResolved(absolutePath);
}

function parseWorktreeList(output) {
  const records = [];
  let current = null;

  for (const field of output.split("\0")) {
    if (!field) {
      if (current) {
        records.push(current);
        current = null;
      }
      continue;
    }

    const separatorIndex = field.indexOf(" ");
    const key = separatorIndex === -1 ? field : field.slice(0, separatorIndex);
    const value = separatorIndex === -1 ? true : field.slice(separatorIndex + 1);

    if (key === "worktree") {
      if (current) {
        records.push(current);
      }
      current = { path: value };
      continue;
    }

    if (current) {
      current[key] = value;
    }
  }

  if (current) {
    records.push(current);
  }

  return records.filter((record) => typeof record.path === "string");
}

async function worktreeRecordsFrom(inputPath) {
  const output = await runGit([
    "-C",
    inputPath,
    "worktree",
    "list",
    "--porcelain",
    "-z"
  ]);

  return parseWorktreeList(output);
}

async function absoluteCommonGitDirectory(worktreePath) {
  try {
    const output = await runGit([
      "-C",
      worktreePath,
      "rev-parse",
      "--path-format=absolute",
      "--git-common-dir"
    ]);
    return normalizeGitPath(output.trim(), worktreePath);
  } catch {
    const output = await runGit([
      "-C",
      worktreePath,
      "rev-parse",
      "--git-common-dir"
    ]);
    return normalizeGitPath(output.trim(), worktreePath);
  }
}

async function worktreeRootPath(inputPath) {
  if (typeof inputPath !== "string" || !inputPath.trim()) {
    throw new TypeError("A working directory is required.");
  }

  let resolvedPath = await realpathOrResolved(inputPath.trim());
  try {
    const stats = await fs.stat(resolvedPath);
    if (stats.isFile()) resolvedPath = path.dirname(resolvedPath);
  } catch {
    return "";
  }

  try {
    const worktreePath = (
      await runGit(["-C", resolvedPath, "rev-parse", "--show-toplevel"])
    ).trim();
    return worktreePath ? realpathOrResolved(worktreePath) : "";
  } catch {
    return "";
  }
}

async function canonicalProjectPath(inputPath) {
  if (typeof inputPath !== "string" || !inputPath.trim()) {
    throw new TypeError("A project path is required.");
  }

  let resolvedPath = await realpathOrResolved(inputPath.trim());

  try {
    const stats = await fs.stat(resolvedPath);
    if (stats.isFile()) {
      resolvedPath = path.dirname(resolvedPath);
    }
  } catch {
    return resolvedPath;
  }

  let worktreeRoot;
  try {
    worktreeRoot = (
      await runGit(["-C", resolvedPath, "rev-parse", "--show-toplevel"])
    ).trim();
  } catch {
    return resolvedPath;
  }

  worktreeRoot = await realpathOrResolved(worktreeRoot);

  let commonGitDirectory;
  try {
    commonGitDirectory = await absoluteCommonGitDirectory(worktreeRoot);
  } catch {
    return worktreeRoot;
  }

  try {
    // Git guarantees that the main worktree is the first `worktree list`
    // record. Linked worktrees therefore resolve to the original checkout
    // without probing every registered worktree with another Git process.
    const [mainWorktree] = await worktreeRecordsFrom(worktreeRoot);
    if (mainWorktree?.bare !== true && mainWorktree?.prunable !== true) {
      const mainWorktreePath = await realpathOrResolved(mainWorktree.path);
      if (await isExistingDirectory(mainWorktreePath)) {
        return mainWorktreePath;
      }
    }
  } catch {
    // The common Git directory fallback below covers ordinary repositories.
  }

  if (path.basename(commonGitDirectory) === ".git") {
    return realpathOrResolved(path.dirname(commonGitDirectory));
  }

  return worktreeRoot;
}

function statusPath(record, separatorCount) {
  let pathIndex = 0;

  for (let index = 0; index < separatorCount; index += 1) {
    pathIndex = record.indexOf(" ", pathIndex);
    if (pathIndex === -1) {
      return "";
    }
    pathIndex += 1;
  }

  return record.slice(pathIndex);
}

function fileStatus(recordType, xy = "") {
  if (recordType === "?") return "untracked";
  if (recordType === "u" || xy.includes("U") || xy === "AA" || xy === "DD") {
    return "conflicted";
  }
  if (recordType === "2" && xy.includes("R")) return "renamed";
  if (recordType === "2" && xy.includes("C")) return "copied";
  if (xy.includes("A")) return "added";
  if (xy.includes("D")) return "deleted";
  return "modified";
}

function parseStatusRecords(output) {
  const fields = output.split("\0");
  const records = [];

  for (let index = 0; index < fields.length; index += 1) {
    const record = fields[index];
    if (!record) {
      continue;
    }

    const recordType = record[0];
    const xy = record.slice(2, 4);
    let filePath = "";
    let previousPath = null;

    if (recordType === "1") {
      filePath = statusPath(record, 8);
    } else if (recordType === "2") {
      filePath = statusPath(record, 9);
      previousPath = fields[index + 1] || null;
      index += 1;
    } else if (recordType === "u") {
      filePath = statusPath(record, 10);
    } else if (recordType === "?") {
      filePath = record.slice(2);
    }

    if (filePath) {
      records.push({
        path: filePath,
        previousPath,
        status: fileStatus(recordType, xy)
      });
    }
  }

  return records;
}

function parsedLineCount(value) {
  return value === "-" ? null : Number.parseInt(value, 10);
}

function parseNumstat(output) {
  const fields = output.split("\0");
  const stats = new Map();

  for (let index = 0; index < fields.length; index += 1) {
    const record = fields[index];
    if (!record) continue;

    const firstTab = record.indexOf("\t");
    const secondTab = record.indexOf("\t", firstTab + 1);
    if (firstTab === -1 || secondTab === -1) continue;

    const additions = parsedLineCount(record.slice(0, firstTab));
    const deletions = parsedLineCount(record.slice(firstTab + 1, secondTab));
    let filePath = record.slice(secondTab + 1);

    if (!filePath) {
      index += 1;
      index += 1;
      filePath = fields[index] || "";
    }

    if (filePath) {
      stats.set(filePath, {
        additions,
        deletions,
        binary: additions === null || deletions === null
      });
    }
  }

  return stats;
}

async function getTrackedLineStats(worktreePath) {
  try {
    const output = await runGit([
      "-C",
      worktreePath,
      "diff",
      "--numstat",
      "-z",
      "HEAD",
      "--"
    ]);
    return parseNumstat(output);
  } catch {
    try {
      const emptyTree = (
        await runGit(["-C", worktreePath, "hash-object", "-t", "tree", "/dev/null"])
      ).trim();
      const output = await runGit([
        "-C",
        worktreePath,
        "diff",
        "--numstat",
        "-z",
        emptyTree,
        "--"
      ]);
      return parseNumstat(output);
    } catch {
      return new Map();
    }
  }
}

function unavailableLineStats() {
  return { additions: null, deletions: null, binary: false };
}

async function getUntrackedLineStats(worktreePath, relativePath) {
  const absolutePath = path.resolve(worktreePath, relativePath);
  const resolvedRelativePath = path.relative(worktreePath, absolutePath);
  if (
    !resolvedRelativePath ||
    resolvedRelativePath === ".." ||
    resolvedRelativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(resolvedRelativePath)
  ) {
    return unavailableLineStats();
  }

  try {
    const stats = await fs.lstat(absolutePath);
    if (stats.isSymbolicLink()) {
      const linkTarget = await fs.readlink(absolutePath);
      return {
        additions: linkTarget ? 1 : 0,
        deletions: 0,
        binary: false
      };
    }
    if (!stats.isFile()) {
      return unavailableLineStats();
    }
    if (stats.size > UNTRACKED_FILE_MAX_BYTES) {
      return unavailableLineStats();
    }

    const file = await fs.open(absolutePath, "r");
    const buffer = Buffer.alloc(64 * 1024);
    let bytesReadTotal = 0;
    let inspectedBytes = 0;
    let lineCount = 0;
    let lastByte = null;

    try {
      while (true) {
        const { bytesRead } = await file.read(buffer, 0, buffer.length, null);
        if (!bytesRead) break;
        if (bytesReadTotal + bytesRead > UNTRACKED_FILE_MAX_BYTES) {
          return unavailableLineStats();
        }

        const inspectionLength = Math.min(bytesRead, 8_000 - inspectedBytes);
        for (let index = 0; index < inspectionLength; index += 1) {
          if (buffer[index] === 0) {
            return { additions: null, deletions: null, binary: true };
          }
        }
        inspectedBytes += inspectionLength;

        for (let index = 0; index < bytesRead; index += 1) {
          if (buffer[index] === 10) lineCount += 1;
        }
        bytesReadTotal += bytesRead;
        lastByte = buffer[bytesRead - 1];
      }
    } finally {
      await file.close();
    }

    if (bytesReadTotal > 0 && lastByte !== 10) lineCount += 1;
    return { additions: lineCount, deletions: 0, binary: false };
  } catch {
    return unavailableLineStats();
  }
}

async function getWorktreeChanges(worktreePath) {
  try {
    const [statusOutput, lineStats] = await Promise.all([
      runGit([
        "-C",
        worktreePath,
        "status",
        "--porcelain=v2",
        "-z",
        "--untracked-files=all"
      ]),
      getTrackedLineStats(worktreePath)
    ]);
    const changes = parseStatusRecords(statusOutput);
    const untrackedChanges = changes.filter((change) => change.status === "untracked");

    for (let index = 0; index < untrackedChanges.length; index += 4) {
      const batch = untrackedChanges.slice(index, index + 4);
      const batchStats = await Promise.all(
        batch.map(async (change) => [
          change.path,
          await getUntrackedLineStats(worktreePath, change.path)
        ])
      );
      for (const [filePath, stats] of batchStats) {
        lineStats.set(filePath, stats);
      }
    }

    return changes.map((change) => ({
      ...change,
      ...(lineStats.get(change.path) ?? unavailableLineStats())
    }));
  } catch {
    return [];
  }
}

async function isExistingDirectory(directoryPath) {
  try {
    return (await fs.stat(directoryPath)).isDirectory();
  } catch {
    return false;
  }
}

async function getLastCommit(worktreePath) {
  try {
    const output = await runGit([
      "-C",
      worktreePath,
      "log",
      "-1",
      "--format=%H%x00%aI%x00%s%x00%b"
    ]);
    const [hash = "", authoredAt = "", title = "", ...bodyParts] = output.split("\0");

    if (!hash.trim()) {
      return null;
    }

    return {
      hash: hash.trim(),
      title: title.trim(),
      body: bodyParts.join("\0").replace(/\s+$/u, ""),
      authoredAt: authoredAt.trim()
    };
  } catch {
    return null;
  }
}

async function listWorktrees(projectPath) {
  if (typeof projectPath !== "string" || !projectPath.trim()) {
    return [];
  }

  let mainProjectPath;
  let worktrees;

  try {
    mainProjectPath = await canonicalProjectPath(projectPath);
    worktrees = await worktreeRecordsFrom(mainProjectPath);
  } catch {
    return [];
  }

  const normalizedMainPath = await realpathOrResolved(mainProjectPath);
  const results = await Promise.all(
    worktrees
      .filter((worktree) => worktree.bare !== true && worktree.prunable !== true)
      .map(async (worktree) => {
        const worktreePath = await realpathOrResolved(worktree.path);
        if (!(await isExistingDirectory(worktreePath))) {
          return null;
        }
        const [changes, lastCommit] = await Promise.all([
          getWorktreeChanges(worktreePath),
          getLastCommit(worktreePath)
        ]);

        let branch = "";
        if (typeof worktree.branch === "string") {
          branch = worktree.branch.replace(/^refs\/heads\//u, "");
        } else if (worktree.detached === true) {
          branch = worktree.HEAD ? `detached@${worktree.HEAD.slice(0, 7)}` : "detached";
        }

        return {
          path: worktreePath,
          name: path.basename(worktreePath) || worktreePath,
          branch,
          changeCount: changes.length,
          changes,
          isMain: worktreePath === normalizedMainPath,
          lastCommit
        };
      })
  );

  return results.filter(Boolean);
}

module.exports = {
  canonicalProjectPath,
  listWorktrees,
  worktreeRootPath
};
