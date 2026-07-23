const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { listWorktrees } = require("../electron/git-service.cjs");

function git(repositoryPath, ...args) {
  return execFileSync("/usr/bin/git", args, {
    cwd: repositoryPath,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
}

test("listWorktrees reports file statuses and per-file line changes", async (context) => {
  const repositoryPath = fs.mkdtempSync(path.join(os.tmpdir(), "tonic-git-service-"));
  context.after(() => fs.rmSync(repositoryPath, { recursive: true, force: true }));

  git(repositoryPath, "init", "--quiet");
  git(repositoryPath, "config", "user.name", "Tonic Tests");
  git(repositoryPath, "config", "user.email", "tonic-tests@example.com");

  fs.writeFileSync(path.join(repositoryPath, "modified.txt"), "first\nsecond\n");
  fs.writeFileSync(path.join(repositoryPath, "removed.txt"), "removed\n");
  fs.writeFileSync(path.join(repositoryPath, "rename-old.txt"), "one\ntwo\nthree\n");
  git(repositoryPath, "add", ".");
  git(repositoryPath, "commit", "--quiet", "-m", "initial");

  fs.writeFileSync(path.join(repositoryPath, "modified.txt"), "first\nchanged\nadded\n");
  fs.rmSync(path.join(repositoryPath, "removed.txt"));
  git(repositoryPath, "mv", "rename-old.txt", "rename-new.txt");
  fs.appendFileSync(path.join(repositoryPath, "rename-new.txt"), "four\n");
  fs.writeFileSync(path.join(repositoryPath, "untracked.txt"), "alpha\nbeta");
  fs.writeFileSync(path.join(repositoryPath, "binary.dat"), Buffer.from([0, 1, 2, 3]));

  const worktrees = await listWorktrees(repositoryPath);
  assert.equal(worktrees.length, 1);

  const worktree = worktrees[0];
  assert.equal(worktree.changeCount, 5);
  assert.equal(worktree.changes.length, 5);

  const changes = new Map(worktree.changes.map((change) => [change.path, change]));
  assert.deepEqual(changes.get("modified.txt"), {
    path: "modified.txt",
    previousPath: null,
    status: "modified",
    additions: 2,
    deletions: 1,
    binary: false
  });
  assert.deepEqual(changes.get("removed.txt"), {
    path: "removed.txt",
    previousPath: null,
    status: "deleted",
    additions: 0,
    deletions: 1,
    binary: false
  });
  assert.deepEqual(changes.get("rename-new.txt"), {
    path: "rename-new.txt",
    previousPath: "rename-old.txt",
    status: "renamed",
    additions: 1,
    deletions: 0,
    binary: false
  });
  assert.deepEqual(changes.get("untracked.txt"), {
    path: "untracked.txt",
    previousPath: null,
    status: "untracked",
    additions: 2,
    deletions: 0,
    binary: false
  });
  assert.deepEqual(changes.get("binary.dat"), {
    path: "binary.dat",
    previousPath: null,
    status: "untracked",
    additions: null,
    deletions: null,
    binary: true
  });
});

test("listWorktrees reports the final contents of staged files before the first commit", async (context) => {
  const repositoryPath = fs.mkdtempSync(path.join(os.tmpdir(), "tonic-unborn-repo-"));
  context.after(() => fs.rmSync(repositoryPath, { recursive: true, force: true }));

  git(repositoryPath, "init", "--quiet");
  fs.writeFileSync(path.join(repositoryPath, "draft.txt"), "staged version\n");
  git(repositoryPath, "add", "draft.txt");
  fs.writeFileSync(path.join(repositoryPath, "draft.txt"), "current\ncontents\n");

  const [worktree] = await listWorktrees(repositoryPath);
  assert.deepEqual(worktree.changes, [
    {
      path: "draft.txt",
      previousPath: null,
      status: "added",
      additions: 2,
      deletions: 0,
      binary: false
    }
  ]);
});
