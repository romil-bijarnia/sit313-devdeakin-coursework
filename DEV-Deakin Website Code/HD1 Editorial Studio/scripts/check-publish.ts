import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../frontend/dist/", import.meta.url));
async function check(directory: string): Promise<number> {
  let files = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink())
      throw Error("Symbolic links are not allowed in the public bundle.");
    if (entry.isDirectory()) {
      files += await check(path);
      continue;
    }
    const rel = relative(root, path);
    if (!/\.(html|js|css|jpg|jpeg|png|webp|gif|svg|ico|woff2?)$/.test(rel))
      throw Error(`Unexpected public file: ${rel}`);
    if (/\.(html|js|css|svg)$/.test(rel)) {
      const text = await readFile(path, "utf8");
      if (
        /-----BEGIN (?:RSA )?PRIVATE KEY-----|FIRESTORE_SERVICE_ACCOUNT_JSON|GOOGLE_APPLICATION_CREDENTIALS|JWT_SECRET|SENDGRID_API_KEY|GMAIL_CLIENT_SECRET|GMAIL_REFRESH_TOKEN|GMAIL_CLIENT_ID|private_key_id/.test(
          text,
        )
      )
        throw Error(
          `Server credential material or configuration appeared in public output: ${rel}`,
        );
    }
    files++;
  }
  return files;
}
console.log(
  `Public bundle checked: ${await check(root)} files; no server credential configuration found.`,
);
