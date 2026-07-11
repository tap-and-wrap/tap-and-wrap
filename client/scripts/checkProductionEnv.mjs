import {
  loadEnv
} from "vite";

const fileEnvironment =
  loadEnv(
    "production",
    process.cwd(),
    "VITE_"
  );

const environment = {
  ...fileEnvironment,
  ...process.env
};

const required = [
  "VITE_API_URL",
  "VITE_SITE_URL"
];

const missing =
  required.filter(
    (name) =>
      !String(
        environment[name] ||
          ""
      ).trim()
  );

if (missing.length) {
  console.error(
    "Missing production frontend variables:"
  );

  for (
    const name of
      missing
  ) {
    console.error(
      `- ${name}`
    );
  }

  process.exit(1);
}

const parsedUrls =
  new Map();

for (
  const name of
    required
) {
  try {
    const parsed =
      new URL(
        environment[name]
      );

    if (
      ![
        "http:",
        "https:"
      ].includes(
        parsed.protocol
      )
    ) {
      throw new Error();
    }

    parsedUrls.set(
      name,
      parsed
    );
  } catch {
    console.error(
      `${name} must be a valid HTTP or HTTPS URL`
    );

    process.exit(1);
  }
}

const localHostnames =
  new Set([
    "localhost",
    "127.0.0.1",
    "::1"
  ]);

for (
  const [
    name,
    parsed
  ] of parsedUrls
) {
  const hostname =
    parsed.hostname
      .toLowerCase();

  if (
    localHostnames.has(
      hostname
    ) ||
    hostname.endsWith(
      ".localhost"
    )
  ) {
    console.error(
      `${name} cannot use a local URL in a production build`
    );

    process.exit(1);
  }

  if (
    parsed.protocol !==
    "https:"
  ) {
    console.error(
      `${name} must use HTTPS in a production build`
    );

    process.exit(1);
  }
}

console.log(
  "Frontend production environment is valid."
);
