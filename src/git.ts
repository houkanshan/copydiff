import { spawn } from "bun";

const getRepoRoot = async (): Promise<string> => {
  const proc = spawn(["git", "rev-parse", "--show-toplevel"], {
    stdout: "pipe",
    stderr: "pipe"
  });
  const output = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const errorText = await new Response(proc.stderr).text();
    throw new Error(`git rev-parse failed: ${errorText.trim()}`);
  }
  return output.trim();
};

const getHeadSha = async (): Promise<string> => {
  const proc = spawn(["git", "rev-parse", "HEAD"], {
    stdout: "pipe",
    stderr: "pipe"
  });
  const output = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const errorText = await new Response(proc.stderr).text();
    throw new Error(`git rev-parse HEAD failed: ${errorText.trim()}`);
  }
  return output.trim();
};

type DiffConfigMode = "force" | "respect";

const diffConfigArgs = [
  "-c",
  "diff.algorithm=histogram",
  "-c",
  "diff.colorMoved=dimmed-zebra",
  "-c",
  "diff.colorMovedWS=allow-indentation-change",
  "-c",
  "diff.mnemonicPrefix=true",
  "-c",
  "diff.renames=copies"
];

const runGitDiff = async (range: string, configMode: DiffConfigMode): Promise<string> => {
  const configArgs = configMode === "force" ? diffConfigArgs : [];
  const proc = spawn(["git", ...configArgs, "diff", "--color=always", range], {
    stdout: "pipe",
    stderr: "pipe"
  });
  const output = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const errorText = await new Response(proc.stderr).text();
    throw new Error(`git diff failed: ${errorText.trim()}`);
  }
  return output;
};

export { getHeadSha, getRepoRoot, runGitDiff };
export type { DiffConfigMode };
