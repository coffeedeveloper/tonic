const yoloFlags = Object.freeze({
  codex: "--dangerously-bypass-approvals-and-sandbox",
  claude: "--allow-dangerously-skip-permissions --permission-mode auto"
});

function buildResumeCommand(session, yoloMode = false) {
  if (!session || (session.agent !== "codex" && session.agent !== "claude")) {
    throw new TypeError("Invalid coding agent.");
  }

  const command =
    session.agent === "claude"
      ? `claude --resume ${session.id}`
      : `codex resume ${session.id}`;
  return yoloMode ? `${command} ${yoloFlags[session.agent]}` : command;
}

module.exports = { buildResumeCommand };
