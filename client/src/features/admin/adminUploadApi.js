import { apiClient } from "../../lib/apiClient";

export async function uploadAdminProductImage({
  file,
  onProgress
}) {
  const formData = new FormData();

  formData.append("image", file);

  const response = await apiClient.post(
    "/admin/uploads/product-image",
    formData,
    {
      onUploadProgress(progressEvent) {
        if (
          typeof onProgress !== "function" ||
          !progressEvent.total
        ) {
          return;
        }

        onProgress(
          Math.round(
            (progressEvent.loaded * 100) /
              progressEvent.total
          )
        );
      }
    }
  );

  return response.data;
}

export function getAdminUploadErrorMessage(error) {
  return (
    error?.response?.data?.message ||
    "The product image could not be uploaded."
  );
}