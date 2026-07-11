import {
  readdirSync
} from "node:fs";
import {
  extname,
  join
} from "node:path";
import {
  spawnSync
} from "node:child_process";
import {
  fileURLToPath
} from "node:url";

const sourceDirectory =
  fileURLToPath(
    new URL(
      "../",
      import.meta.url
    )
  );

function collectJavaScriptFiles(
  directory
) {
  return readdirSync(
    directory,
    {
      withFileTypes: true
    }
  ).flatMap((entry) => {
    const entryPath =
      join(
        directory,
        entry.name
      );

    if (entry.isDirectory()) {
      return collectJavaScriptFiles(
        entryPath
      );
    }

    return extname(entry.name) ===
      ".js"
      ? [entryPath]
      : [];
  });
}

const files =
  collectJavaScriptFiles(
    sourceDirectory
  );

for (const file of files) {
  const result =
    spawnSync(
      process.execPath,
      [
        "--check",
        file
      ],
      {
        stdio: "inherit"
      }
    );

  if (result.status !== 0) {
    process.exit(
      result.status || 1
    );
  }
}

console.log(
  `Server syntax is valid (${files.length} files).`
);
