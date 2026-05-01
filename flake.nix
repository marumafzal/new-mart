{
  description = "Reproducible development shell for the mart workspace";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-25.05";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils, ... }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };
        node = pkgs.nodejs_22;
        pnpm = pkgs.nodePackages.pnpm;
        corepack = pkgs.nodePackages.corepack;
      in {
        devShell = pkgs.mkShell {
          buildInputs = [
            node
            pnpm
            corepack
            pkgs.git
            pkgs.python311
            pkgs.openssh
            pkgs.postgresql_16
          ];

          shellHook = ''
            export PATH=${pnpm}/bin:$PATH
            echo "Nix flake shell active: $(node --version) $(pnpm --version)"
          '';
        };
      });
}
