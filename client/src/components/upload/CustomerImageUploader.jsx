import {
  useEffect,
  useId,
  useRef,
  useState
} from "react";
import {
  CheckCircle2,
  ExternalLink,
  ImagePlus,
  LoaderCircle,
  Trash2,
  UploadCloud
} from "lucide-react";
import toast from "react-hot-toast";

import {
  getUploadErrorMessage,
  uploadCustomerImage
} from "../../features/uploads/uploadApi";

const MAX_FILE_SIZE =
  5 * 1024 * 1024;

const allowedFileTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp"
]);

function getAssetUrl(asset) {
  return (
    asset?.imageUrl ||
    asset?.url ||
    ""
  );
}

function getAssetFileName(asset) {
  return (
    asset?.originalFileName ||
    asset?.imageFileName ||
    "Uploaded image"
  );
}

export default function CustomerImageUploader({
  type,
  value,
  onChange,
  label = "Upload image",
  helpText = "Upload a JPG, PNG, or WEBP image.",
  required = false,
  disabled = false
}) {
  const inputId = useId();
  const inputRef = useRef(null);

  const [
    localPreview,
    setLocalPreview
  ] = useState("");

  const [
    isUploading,
    setIsUploading
  ] = useState(false);

  const [
    progress,
    setProgress
  ] = useState(0);

  const [
    errorMessage,
    setErrorMessage
  ] = useState("");

  const uploadedImageUrl =
    getAssetUrl(value);

  const displayImageUrl =
    localPreview ||
    uploadedImageUrl;

  useEffect(() => {
    return () => {
      if (
        localPreview.startsWith(
          "blob:"
        )
      ) {
        URL.revokeObjectURL(
          localPreview
        );
      }
    };
  }, [localPreview]);

  function clearInput() {
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  function validateFile(file) {
    if (
      !allowedFileTypes.has(
        file.type
      )
    ) {
      return "Only JPG, PNG, and WEBP images are allowed.";
    }

    if (
      file.size >
      MAX_FILE_SIZE
    ) {
      return "The image cannot exceed 5 MB.";
    }

    return "";
  }

  async function handleFileChange(
    event
  ) {
    const file =
      event.target.files?.[0];

    if (!file) {
      return;
    }

    const validationError =
      validateFile(file);

    if (validationError) {
      setErrorMessage(
        validationError
      );

      toast.error(
        validationError
      );

      clearInput();

      return;
    }

    const previewUrl =
      URL.createObjectURL(file);

    setLocalPreview(
      previewUrl
    );

    setErrorMessage("");
    setIsUploading(true);
    setProgress(0);

    try {
      const response =
        await uploadCustomerImage({
          file,
          type,

          onProgress(value) {
            setProgress(value);
          }
        });

      onChange?.(
        response.asset
      );

      setProgress(100);

      setLocalPreview("");

      toast.success(
        "Image uploaded successfully"
      );
    } catch (error) {
      const message =
        getUploadErrorMessage(
          error
        );

      setErrorMessage(
        message
      );

      setLocalPreview("");

      toast.error(message);
    } finally {
      setIsUploading(false);
      clearInput();
    }
  }

  function handleRemove() {
    if (
      isUploading ||
      disabled
    ) {
      return;
    }

    setLocalPreview("");
    setProgress(0);
    setErrorMessage("");

    onChange?.(null);

    clearInput();
  }

  const controlsDisabled =
    disabled || isUploading;

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <label
            htmlFor={inputId}
            className="text-sm font-semibold text-[#4b332b]"
          >
            {label}

            {required ? (
              <span className="ml-1 text-red-600">
                *
              </span>
            ) : null}
          </label>

          {helpText ? (
            <p className="mt-1 text-sm leading-6 text-[#806a62]">
              {helpText}
            </p>
          ) : null}
        </div>

        {uploadedImageUrl ? (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-700">
            <CheckCircle2
              size={13}
            />

            Uploaded
          </span>
        ) : null}
      </div>

      {!displayImageUrl ? (
        <label
          htmlFor={inputId}
          className={`mt-4 flex min-h-44 flex-col items-center justify-center rounded-3xl border border-dashed border-[#d8bfb6] bg-white px-6 py-8 text-center transition ${
            controlsDisabled
              ? "cursor-not-allowed opacity-60"
              : "cursor-pointer hover:border-[#9a766b] hover:bg-[#fffaf7]"
          }`}
        >
          {isUploading ? (
            <LoaderCircle
              size={34}
              className="animate-spin text-[#8a675c]"
            />
          ) : (
            <UploadCloud
              size={34}
              className="text-[#8a675c]"
            />
          )}

          <p className="mt-4 font-semibold text-[#2c1f1b]">
            {isUploading
              ? "Uploading image..."
              : "Choose an image"}
          </p>

          <p className="mt-2 text-sm text-[#806a62]">
            JPG, PNG, or WEBP · Maximum
            5 MB
          </p>
        </label>
      ) : (
        <div className="mt-4 overflow-hidden rounded-3xl border border-[#ead9d2] bg-white">
          <div className="relative bg-[#f8efeb]">
            <img
              src={displayImageUrl}
              alt={
                getAssetFileName(
                  value
                )
              }
              className="max-h-80 w-full object-contain"
            />

            {isUploading ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#2c1f1b]/70 px-6 text-white">
                <LoaderCircle
                  size={32}
                  className="animate-spin"
                />

                <p className="mt-4 font-semibold">
                  Uploading — {progress}%
                </p>
              </div>
            ) : null}
          </div>

          <div className="p-4">
            <p className="truncate text-sm font-semibold text-[#2c1f1b]">
              {getAssetFileName(
                value
              )}
            </p>

            {isUploading ? (
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#ead9d2]">
                <div
                  className="h-full rounded-full bg-[#5a3d34] transition-all"
                  style={{
                    width: `${progress}%`
                  }}
                />
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-2">
              <label
                htmlFor={inputId}
                className={`inline-flex items-center gap-2 rounded-full border border-[#d8c7bf] bg-white px-4 py-2 text-sm font-semibold text-[#5a3d34] transition ${
                  controlsDisabled
                    ? "cursor-not-allowed opacity-50"
                    : "cursor-pointer hover:bg-[#fff8f4]"
                }`}
              >
                <ImagePlus size={15} />
                Replace
              </label>

              {uploadedImageUrl ? (
                <a
                  href={
                    uploadedImageUrl
                  }
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-full border border-[#d8c7bf] bg-white px-4 py-2 text-sm font-semibold text-[#5a3d34] transition hover:bg-[#fff8f4]"
                >
                  <ExternalLink
                    size={15}
                  />
                  Open
                </a>
              ) : null}

              <button
                type="button"
                onClick={handleRemove}
                disabled={
                  controlsDisabled
                }
                className="ml-auto inline-flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Trash2 size={15} />
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
        disabled={
          controlsDisabled
        }
        onChange={
          handleFileChange
        }
        className="sr-only"
      />

      {errorMessage ? (
        <p className="mt-3 text-sm font-medium text-red-700">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}