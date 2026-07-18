const { execFile } = require("node:child_process");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);
const GIT_MAX_BUFFER = 16 * 1024 * 1024;

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

async function absoluteGitDirectory(worktreePath) {
  try {
    const output = await runGit([
      "-C",
      worktreePath,
      "rev-parse",
      "--path-format=absolute",
      "--absolute-git-dir"
    ]);
    return normalizeGitPath(output.trim(), worktreePath);
  } catch {
    const output = await runGit([
      "-C",
      worktreePath,
      "rev-parse",
      "--absolute-git-dir"
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
    const worktrees = await worktreeRecordsFrom(worktreeRoot);
    for (const worktree of worktrees) {
      if (worktree.bare === true) {
        continue;
      }

      try {
        const worktreePath = await realpathOrResolved(worktree.path);
        const gitDirectory = await absoluteGitDirectory(worktreePath);
        if (gitDirectory === commonGitDirectory) {
          return worktreePath;
        }
      } catch {
        // A prunable worktree can disappear while Git still lists it.
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

function countStatusRecords(output) {
  const fields = output.split("\0");
  let count = 0;

  for (let index = 0; index < fields.length; index += 1) {
    const record = fields[index];
    if (!record) {
      continue;
    }

    const recordType = record[0];
    if (recordType === "1" || recordType === "u" || recordType === "?") {
      count += 1;
    } else if (recordType === "2") {
      count += 1;
      index += 1;
    }
  }

  return count;
}

async function getChangeCount(worktreePath) {
  try {
    const output = await runGit([
      "-C",
      worktreePath,
      "status",
      "--porcelain=v2",
      "-z",
      "--untracked-files=all"
    ]);
    return countStatusRecords(output);
  } catch {
    return 0;
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
        const [changeCount, lastCommit] = await Promise.all([
          getChangeCount(worktreePath),
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
          changeCount,
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
