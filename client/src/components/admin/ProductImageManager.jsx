import {
  useId,
  useRef,
  useState
} from "react";
import {
  ArrowDown,
  ArrowUp,
  Crown,
  ImagePlus,
  LoaderCircle,
  MousePointer2,
  Trash2,
  UploadCloud
} from "lucide-react";
import toast from "react-hot-toast";

import {
  getAdminUploadErrorMessage,
  uploadAdminProductImage
} from "../../features/admin/adminUploadApi";

const MAX_FILE_SIZE =
  5 * 1024 * 1024;

const allowedTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp"
]);

function normalizeImageOrder(images) {
  return images.map((image, index) => ({
    ...image,
    sortOrder: index
  }));
}

export default function ProductImageManager({
  images,
  onChange
}) {
  const inputId = useId();
  const inputRef = useRef(null);

  const [isUploading, setIsUploading] =
    useState(false);

  const [progress, setProgress] =
    useState(0);

  const mainImage =
    images.find((image) => image.isMain) ||
    images[0];

  const hoverImage =
    images.find(
      (image) =>
        image.publicId !==
        mainImage?.publicId
    ) || null;

  async function handleFiles(event) {
    const selectedFiles = Array.from(
      event.target.files || []
    );

    if (!selectedFiles.length) {
      return;
    }

    const validFiles = [];

    for (const file of selectedFiles) {
      if (!allowedTypes.has(file.type)) {
        toast.error(
          `${file.name}: only JPG, PNG, and WEBP images are allowed.`
        );

        continue;
      }

      if (file.size > MAX_FILE_SIZE) {
        toast.error(
          `${file.name}: the image cannot exceed 5 MB.`
        );

        continue;
      }

      validFiles.push(file);
    }

    if (!validFiles.length) {
      event.target.value = "";
      return;
    }

    setIsUploading(true);
    setProgress(0);

    try {
      const uploadedImages = [];

      for (
        let index = 0;
        index < validFiles.length;
        index += 1
      ) {
        const file = validFiles[index];

        const response =
          await uploadAdminProductImage({
            file,

            onProgress(value) {
              const completedFiles =
                index / validFiles.length;

              const currentFile =
                value /
                100 /
                validFiles.length;

              setProgress(
                Math.round(
                  (completedFiles +
                    currentFile) *
                    100
                )
              );
            }
          });

        uploadedImages.push({
          url: response.asset.url,
          publicId:
            response.asset.publicId,
          alt: "",
          isMain:
            images.length === 0 &&
            uploadedImages.length === 0,
          sortOrder:
            images.length +
            uploadedImages.length
        });
      }

      onChange(
        normalizeImageOrder([
          ...images,
          ...uploadedImages
        ])
      );

      setProgress(100);

      toast.success(
        `${uploadedImages.length} image${
          uploadedImages.length === 1
            ? ""
            : "s"
        } uploaded`
      );
    } catch (error) {
      toast.error(
        getAdminUploadErrorMessage(error)
      );
    } finally {
      setIsUploading(false);

      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  }

  function setMainImage(publicId) {
    onChange(
      images.map((image) => ({
        ...image,
        isMain:
          image.publicId === publicId
      }))
    );
  }

  function updateAlt(publicId, alt) {
    onChange(
      images.map((image) =>
        image.publicId === publicId
          ? {
              ...image,
              alt
            }
          : image
      )
    );
  }

  function moveImage(index, direction) {
    const targetIndex =
      index + direction;

    if (
      targetIndex < 0 ||
      targetIndex >= images.length
    ) {
      return;
    }

    const nextImages = [...images];

    const [movedImage] =
      nextImages.splice(index, 1);

    nextImages.splice(
      targetIndex,
      0,
      movedImage
    );

    onChange(
      normalizeImageOrder(nextImages)
    );
  }

  function removeImage(publicId) {
    const remainingImages =
      images.filter(
        (image) =>
          image.publicId !== publicId
      );

    const removedImage =
      images.find(
        (image) =>
          image.publicId === publicId
      );

    if (
      removedImage?.isMain &&
      remainingImages.length
    ) {
      remainingImages[0] = {
        ...remainingImages[0],
        isMain: true
      };
    }

    onChange(
      normalizeImageOrder(
        remainingImages
      )
    );
  }

  return (
    <div className="rounded-[1.8rem] border border-[#e5d8d2] bg-white p-6 shadow-sm">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <h3 className="text-xl font-semibold">
            Product images
          </h3>

          <p className="mt-2 text-sm leading-6 text-[#806a62]">
            The main image appears first. The first
            non-main image is used when customers hover
            over the product card.
          </p>
        </div>

        <label
          htmlFor={inputId}
          className={`inline-flex cursor-pointer items-center justify-center gap-2 rounded-full bg-[#2c1f1b] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#4b332b] ${
            isUploading
              ? "pointer-events-none opacity-60"
              : ""
          }`}
        >
          <ImagePlus size={17} />
          Add images
        </label>

        <input
          ref={inputRef}
          id={inputId}
          type="file"
          multiple
          accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
          onChange={handleFiles}
          className="sr-only"
        />
      </div>

      {isUploading ? (
        <div className="mt-5 rounded-3xl bg-[#faf7f5] p-5">
          <div className="flex items-center gap-3">
            <LoaderCircle
              size={20}
              className="animate-spin text-[#7b584d]"
            />

            <p className="font-semibold">
              Uploading images — {progress}%
            </p>
          </div>

          <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#ead9d2]">
            <div
              className="h-full rounded-full bg-[#5a3d34] transition-all"
              style={{
                width: `${progress}%`
              }}
            />
          </div>
        </div>
      ) : null}

      {!images.length && !isUploading ? (
        <label
          htmlFor={inputId}
          className="mt-5 flex cursor-pointer flex-col items-center justify-center rounded-3xl border border-dashed border-[#d8bfb6] bg-[#fffaf7] px-6 py-12 text-center"
        >
          <UploadCloud
            size={36}
            className="text-[#8a675c]"
          />

          <p className="mt-4 font-semibold">
            Upload product images
          </p>

          <p className="mt-2 text-sm text-[#806a62]">
            JPG, PNG, or WEBP. Maximum 5 MB per image.
          </p>
        </label>
      ) : null}

      {images.length ? (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {images.map((image, index) => {
            const isHoverImage =
              hoverImage?.publicId ===
              image.publicId;

            return (
              <article
                key={image.publicId}
                className="overflow-hidden rounded-3xl border border-[#e5d8d2] bg-[#faf7f5]"
              >
                <div className="relative aspect-[4/3] overflow-hidden bg-[#f4e5df]">
                  <img
                    src={image.url}
                    alt={
                      image.alt ||
                      "Product preview"
                    }
                    className="h-full w-full object-contain"
                  />

                  <div className="absolute left-3 top-3 flex flex-wrap gap-2">
                    {image.isMain ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#2c1f1b] px-3 py-1.5 text-xs font-semibold text-white">
                        <Crown size={12} />
                        Main
                      </span>
                    ) : null}

                    {isHoverImage ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-xs font-semibold text-[#5a3d34]">
                        <MousePointer2
                          size={12}
                        />
                        Hover
                      </span>
                    ) : null}
                  </div>

                  <span className="absolute bottom-3 right-3 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-[#5a3d34]">
                    #{index + 1}
                  </span>
                </div>

                <div className="p-4">
                  <label className="grid gap-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#806a62]">
                      Alternative text
                    </span>

                    <input
                      value={image.alt || ""}
                      onChange={(event) =>
                        updateAlt(
                          image.publicId,
                          event.target.value
                        )
                      }
                      placeholder="Describe this image"
                      className="rounded-2xl border border-[#e5d8d2] bg-white px-4 py-3 text-sm outline-none"
                    />
                  </label>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {!image.isMain ? (
                      <button
                        type="button"
                        onClick={() =>
                          setMainImage(
                            image.publicId
                          )
                        }
                        className="inline-flex items-center gap-2 rounded-full border border-[#d8c7bf] bg-white px-4 py-2 text-xs font-semibold text-[#5a3d34]"
                      >
                        <Crown size={14} />
                        Set main
                      </button>
                    ) : null}

                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() =>
                        moveImage(index, -1)
                      }
                      className="rounded-full border border-[#e5d8d2] bg-white p-2 text-[#5a3d34] disabled:opacity-35"
                      aria-label="Move image up"
                    >
                      <ArrowUp size={15} />
                    </button>

                    <button
                      type="button"
                      disabled={
                        index ===
                        images.length - 1
                      }
                      onClick={() =>
                        moveImage(index, 1)
                      }
                      className="rounded-full border border-[#e5d8d2] bg-white p-2 text-[#5a3d34] disabled:opacity-35"
                      aria-label="Move image down"
                    >
                      <ArrowDown size={15} />
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        removeImage(
                          image.publicId
                        )
                      }
                      className="ml-auto rounded-full border border-red-200 bg-red-50 p-2 text-red-700 transition hover:bg-red-100"
                      aria-label="Remove image"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}