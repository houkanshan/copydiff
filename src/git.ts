import { spawn } from "bun";

const getRepoRoot = async (): Promise<string> => {
  const proc = spawn(["git", "rev-parse", "--show-toplevel"], {
    stdout: "pipe",
    stderr: "pipe"
  });
  const [output, errorText, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited
  ]);
  if (exitCode !== 0) {
    throw new Error(`git rev-parse failed: ${errorText.trim()}`);
  }
  return output.trim();
};

const getHeadSha = async (): Promise<string> => {
  const proc = spawn(["git", "rev-parse", "HEAD"], {
    stdout: "pipe",
    stderr: "pipe"
  });
  const [output, errorText, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited
  ]);
  if (exitCode !== 0) {
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
  const [output, errorText, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited
  ]);
  if (exitCode !== 0) {
    throw new Error(`git diff failed: ${errorText.trim()}`);
  }
  return output;
};

const readGitColor = async (key: string): Promise<string | undefined> => {
  const proc = spawn(["git", "config", "--get-color", key], {
    stdout: "pipe",
    stderr: "pipe"
  });
  const [output, exitCode] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
  if (exitCode !== 0) {
    return undefined;
  }
  const trimmed = output.trimEnd();
  return trimmed.length > 0 ? trimmed : undefined;
};

const parseGitColorSpec = async (spec: string): Promise<string | undefined> => {
  const proc = spawn(
    ["git", "-c", `color.copydiff.copyColor=${spec}`, "config", "--get-color", "color.copydiff.copyColor"],
    {
      stdout: "pipe",
      stderr: "pipe"
    }
  );
  const [output, exitCode] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
  if (exitCode !== 0) {
    return undefined;
  }
  const trimmed = output.trimEnd();
  return trimmed.length > 0 ? trimmed : undefined;
};

export { getHeadSha, getRepoRoot, parseGitColorSpec, readGitColor, runGitDiff };
export type { DiffConfigMode };
