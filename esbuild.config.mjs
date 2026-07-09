import * as esbuild from "esbuild";
import { mkdirSync, readFileSync, writeFileSync } from "fs";

const watch = process.argv.includes("--watch");

mkdirSync("dist", { recursive: true });

const uiHtml = readFileSync("src/ui.html", "utf8");

const buildUi = async () => {
  const result = await esbuild.build({
    entryPoints: ["src/ui-entry.ts"],
    bundle: true,
    write: false,
    format: "iife",
    target: "es2020",
  });

  const js = result.outputFiles[0].text;
  const html = uiHtml.replace("<!-- SCRIPT -->", `<script>${js}</script>`);
  writeFileSync("dist/ui.html", html);
};

const figmaPlugin = {
  name: "figma-plugin",
  setup(build) {
    build.onLoad({ filter: /code\.ts$/ }, async (args) => {
      const source = await import("fs").then((fs) =>
        fs.promises.readFile(args.path, "utf8")
      );
      return {
        contents: source.replace(
          "__html__",
          JSON.stringify(readFileSync("dist/ui.html", "utf8"))
        ),
        loader: "ts",
      };
    });
  },
};

const buildCode = async () => {
  await buildUi();

  const ctx = await esbuild.context({
    entryPoints: ["src/code.ts"],
    bundle: true,
    outfile: "dist/code.js",
    target: "es2020",
    logLevel: "info",
    plugins: [figmaPlugin],
  });

  if (watch) {
    await ctx.watch();
    console.log("Watching for changes...");
  } else {
    await ctx.rebuild();
    await ctx.dispose();
    console.log("Build complete → dist/");
  }
};

await buildCode();
