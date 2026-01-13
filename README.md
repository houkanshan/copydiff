# copydiff

`copydiff` is a Bun + TypeScript helper that augments `git diff` output with copy/clone awareness using `jscpd` while preserving Git's moved-line coloring.

## Usage

Filter mode:

```bash
git diff --color=always | copydiff --stdin
```

Generate HTML output:

```bash
git diff --color=always | copydiff --stdin --html out.html
```

Wrapper mode:

```bash
copydiff base..head
```

## Options

- `--stdin` read diff from stdin.
- `--html <path>` write a light-mode HTML diff.
- `--no-fold-pure` disable folding for pure copies.
- `--pure-threshold <0..1>` similarity threshold for pure copies (default `0.98`).
- `--min-fold-lines <n>` minimum lines to fold (default `12`).
- `--min-lines <n>` minimum lines for `jscpd` (default `8`).
- `--ignore <glob,glob>` ignored globs for `jscpd`.
- `--cache <on|off>` enable clone cache (default `on`).
- `--verbose` log `jscpd` output.
- `--diff-config <force|respect>` set git diff config mode for wrapper mode (default `force`).

## Exit codes

- `0` success
- `2` invalid args
- `3` `jscpd` failure

## Local Development

```bash
bun install
bun link
```
