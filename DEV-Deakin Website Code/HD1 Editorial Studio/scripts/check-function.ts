import { build } from "esbuild";
const result = await build({
  entryPoints: ["netlify/functions/api.ts"],
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  write: false,
  outfile: "api.mjs",
  external: ["express", "@google-cloud/firestore", "serverless-http"],
  metafile: true,
});
const inputs = Object.keys(result.metafile.inputs);
if (
  inputs.some(
    (path) =>
      /(?:^|\/)(?:frontend|tests|qa|secrets|\.private)\//.test(path) ||
      path.endsWith("server/index.ts"),
  )
)
  throw Error("Unexpected source included in the function build.");
const output = result.outputFiles[0].text;
if (/-----BEGIN (?:RSA )?PRIVATE KEY-----/.test(output))
  throw Error("Credential material appeared in the function source.");
console.log(
  `Serverless adapter compiled for Node22: ${inputs.length} source modules; no local entry, frontend, tests or credential files bundled.`,
);
