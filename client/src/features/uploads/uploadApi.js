import {
  apiClient
} from "../../lib/apiClient";

export async function uploadCustomerImage({
  file,
  type,
  onProgress
}) {
  const formData =
    new FormData();

  formData.append(
    "image",
    file
  );

  formData.append(
    "type",
    type
  );

  const response =
    await apiClient.post(
      "/uploads/customer-image",
      formData,
      {
        onUploadProgress(
          progressEvent
        ) {
          if (
            typeof onProgress !==
              "function" ||
            !progressEvent.total
          ) {
            return;
          }

          onProgress(
            Math.round(
              (progressEvent.loaded *
                100) /
                progressEvent.total
            )
          );
        }
      }
    );

  return response.data;
}

export function getUploadErrorMessage(
  error
) {
  return (
    error?.response?.data
      ?.message ||
    "The image could not be uploaded. Please try again."
  );
}
