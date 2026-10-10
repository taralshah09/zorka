#!/usr/bin/env node
// PreToolUse guard: Codex may never commit, push, or otherwise write
// history / publish to GitHub in this repo. Exit code 2 blocks the tool call
// and sends stderr back to Codex.

let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  let cmd = "";
  try {
    const input = JSON.parse(raw);
    const c = input.tool_input && (input.tool_input.command ?? input.tool_input.cmd);
    // Codex may pass the command as an argv array (e.g. ["bash", "-lc", "git push"]).
    cmd = Array.isArray(c) ? c.join(" ") : String(c || "");
  } catch {
    // Unparseable input: fail closed.
    block("could not parse tool input");
  }

  // git [global opts] <subcommand>  — global opts like -C <path>, -c k=v, --no-pager
  const gitOpt = String.raw`(?:\s+(?:-[Cc]\s+(?:"[^"]*"|'[^']*'|\S+)|--?[\w-]+(?:=(?:"[^"]*"|'[^']*'|\S+))?))*`;
  const gitWrite = new RegExp(
    String.raw`\bgit(?:\.exe)?` + gitOpt +
      String.raw`\s+(?:commit|commit-tree|push|merge|rebase|cherry-pick|revert|am|tag|update-ref|subtree|filter-branch|filter-repo)\b`,
    "i"
  );
  const gitRemote = new RegExp(
    String.raw`\bgit(?:\.exe)?` + gitOpt + String.raw`\s+remote\s+(?:add|set-url|rename|remove|rm)\b`,
    "i"
  );
  // GitHub CLI: anything that writes to GitHub
  const ghWrite =
    /\bgh(?:\.exe)?\s+(?:api|pr\s+(?:create|merge|edit|close|reopen|comment|review)|repo\s+(?:create|sync|edit|delete|fork|rename)|release\s+(?:create|edit|upload|delete)|gist\s+(?:create|edit)|secret|variable)\b/i;

  if (gitWrite.test(cmd) || gitRemote.test(cmd) || ghWrite.test(cmd)) {
    block(`"${cmd}"`);
  }
  process.exit(0);
});

function block(what) {
  process.stderr.write(
    `BLOCKED by .codex/hooks/block-git-writes.js: ${what}\n` +
      "Codex is not permitted to commit, push, tag, merge, rebase, change remotes, " +
      "or write to GitHub in this repository (https://github.com/taralshah09/kimbo). " +
      "Do not retry or work around this. Tell the user the exact command so they can run it themselves.\n"
  );
  process.exit(2);
}
