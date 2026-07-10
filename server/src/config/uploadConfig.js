function getRootFolder() {
  const configuredFolder =
    process.env.CLOUDINARY_ROOT_FOLDER ||
    "tap-and-wrap";

  return configuredFolder
    .trim()
    .replace(/^\/+|\/+$/g, "");
}

const uploadDefinitions = {
  engraving: {
    subfolder:
      "customer-uploads/engraving",
    maxWidth: 2000,
    maxHeight: 2000
  },

  payment_proof: {
    subfolder:
      "customer-uploads/payment-proofs",
    maxWidth: 2000,
    maxHeight: 2000
  },

  service_request: {
    subfolder:
      "customer-uploads/service-requests",
    maxWidth: 2400,
    maxHeight: 2400
  },

  product_image: {
    subfolder:
      "catalog/products",
    maxWidth: 2400,
    maxHeight: 2400
  }
};

export function getUploadDefinition(type) {
  const definition =
    uploadDefinitions[type];

  if (!definition) {
    return null;
  }

  return {
    ...definition,
    type,

    folder:
      `${getRootFolder()}/${definition.subfolder}`
  };
}

export function getCustomerUploadDefinition(
  type
) {
  const allowedCustomerTypes =
    new Set([
      "engraving",
      "payment_proof",
      "service_request"
    ]);

  if (!allowedCustomerTypes.has(type)) {
    return null;
  }

  return getUploadDefinition(type);
}

export function isTrustedUpload(
  asset,
  type
) {
  const definition =
    getUploadDefinition(type);

  if (!definition) {
    return false;
  }

  const cloudName = String(
    process.env.CLOUDINARY_CLOUD_NAME ||
      ""
  ).trim();

  const imageUrl = String(
    asset?.imageUrl ||
      asset?.url ||
      ""
  ).trim();

  const publicId = String(
    asset?.imagePublicId ||
      asset?.publicId ||
      ""
  ).trim();

  if (
    !cloudName ||
    !imageUrl ||
    !publicId
  ) {
    return false;
  }

  const validUrlPrefix =
    `https://res.cloudinary.com/${cloudName}/`;

  const validPublicIdPrefix =
    `${definition.folder}/`;

  return (
    imageUrl.startsWith(
      validUrlPrefix
    ) &&
    publicId.startsWith(
      validPublicIdPrefix
    )
  );
}

export function isTrustedCustomerUpload(
  asset,
  type
) {
  const definition =
    getCustomerUploadDefinition(type);

  if (!definition) {
    return false;
  }

  return isTrustedUpload(
    asset,
    type
  );
}