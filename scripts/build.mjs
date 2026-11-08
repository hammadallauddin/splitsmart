import { build } from "esbuild";

await build({
    entryPoints: ["src/mcp-server.ts", "src/cli.ts"],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node18",
    outdir: "dist",
    banner: { js: "#!/usr/bin/env node" },
});
