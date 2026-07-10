const required = [
  "VITE_API_URL",
  "VITE_SITE_URL"
];

const missing =
  required.filter(
    (name) =>
      !String(
        process.env[name] ||
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

for (
  const name of
    required
) {
  try {
    const parsed =
      new URL(
        process.env[name]
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
  } catch {
    console.error(
      `${name} must be a valid HTTP or HTTPS URL`
    );

    process.exit(1);
  }
}

console.log(
  "Frontend production environment is valid."
);
