# https://devenv.sh/getting-started
{ pkgs, ... }:
{
  languages.javascript = {
    enable = true;
    package = pkgs.nodejs_22;
    npm.enable = true;
  };

  languages.python = {
    enable = true;
    package = pkgs.python312;
    venv.enable = true;
    venv.requirements = ./requirements.txt;
  };

  # https://devenv.sh/packages/
  packages = with pkgs; [
    # Python tooling
    uv # package manager veloce (alternativa a pip)
    ruff # linter + formatter Python
    pyright # type checker Python (usato da VSCode/Neovim)
    # Misc
    codespell
    git
    just
    onefetch
  ];

  # https://devenv.sh/git-hooks/
  git-hooks.hooks = {
    # Files
    check-symlinks.enable = true;

    # Python
    ruff.enable = true; # linting
    ruff-format.enable = true; # formatting

    # JavaScript / TypeScript
    prettier = {
      enable = true;
      settings.write = true;
    };

    # Nix
    deadnix.enable = true;
    nil.enable = true;
    nixfmt-rfc-style.enable = true;
    statix.enable = true;

    # Shell
    shellcheck.enable = true;

    # TOML
    taplo.enable = true;
    check-toml.enable = true;

    # YAML
    check-yaml.enable = true;
    yamlfmt = {
      enable = true;
      settings.lint-only = false;
    };

    # Misc. formats
    check-json.enable = true;
    markdownlint = {
      enable = true;
      settings.configuration = {
        MD013 = {
          line_length = 100;
          code_blocks = false;
          tables = false;
          headings = false;
        };
      };
    };

    # Hyperlinks
    check-vcs-permalinks.enable = true;

    # EditorConfig
    editorconfig-checker.enable = true;
    end-of-file-fixer.enable = true;
    trim-trailing-whitespace.enable = true;
    mixed-line-endings.enable = true;

    # Git
    commitizen.enable = true;
    check-merge-conflicts.enable = true;
    check-added-large-files.enable = true;

    # Security
    ripsecrets.enable = true;
    detect-private-keys.enable = true;
  };

  enterShell = ''
    # Attiva il virtualenv Python se presente
    if [ -f .venv/bin/activate ]; then
      source .venv/bin/activate
    fi

    onefetch --no-color-palette --no-art --no-title 2>/dev/null || true
    echo "--- Ambiente ---"
    echo "Node:   $(node --version)"
    echo "npm:    $(npm --version)"
    echo "Python: $(python --version)"
    echo "ruff:   $(ruff --version)"
    echo "uv:     $(uv --version)"
    echo "~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~"
    echo "Run 'just' often, to prevent CI failures."
    echo "~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~"
  '';
}
