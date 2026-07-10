import {
  useState
} from "react";
import {
  Building2,
  CheckCircle2,
  Gift,
  Image,
  LoaderCircle,
  PackageOpen,
  PenTool,
  Sparkles
} from "lucide-react";
import {
  useMutation
} from "@tanstack/react-query";
import {
  useForm
} from "react-hook-form";
import {
  zodResolver
} from "@hookform/resolvers/zod";
import { z } from "zod";
import toast from "react-hot-toast";

import Header from "../components/layout/Header";
import Footer from "../components/layout/Footer";
import CustomerImageUploader from "../components/upload/CustomerImageUploader";

import {
  createServiceRequest,
  getServiceRequestErrorMessage
} from "../features/services/serviceRequestApi";

const phoneSchema = z
  .string()
  .trim()
  .min(
    8,
    "Enter a valid phone number"
  )
  .max(20)
  .regex(
    /^\+?[0-9\s-]+$/,
    "Use numbers only"
  );

const formSchema = z.object({
  serviceType: z.enum([
    "engraving",
    "gift_wrapping",
    "photo_printing",
    "custom_gift",
    "corporate_gifting",
    "other"
  ]),

  customer: z.object({
    fullName: z
      .string()
      .trim()
      .min(
        2,
        "Enter your full name"
      ),

    email: z
      .string()
      .trim()
      .email(
        "Enter a valid email address"
      ),

    phone: phoneSchema,

    whatsappNumber: z
      .string()
      .trim()
      .refine(
        (value) =>
          value === "" ||
          /^\+?[0-9\s-]{8,20}$/.test(
            value
          ),
        "Enter a valid WhatsApp number"
      )
  }),

  title: z
    .string()
    .trim()
    .min(
      3,
      "Enter a request title"
    )
    .max(200),

  description: z
    .string()
    .trim()
    .min(
      10,
      "Describe what you need"
    )
    .max(5000),

  quantity: z.coerce
    .number()
    .int()
    .min(1)
    .max(10000),

  budget: z
    .string()
    .optional(),

  neededBy: z
    .string()
    .optional()
});

const serviceOptions = [
  {
    value: "engraving",
    label: "Custom engraving",
    description:
      "Names, dates, messages, logos, and personalized designs.",
    icon: PenTool
  },
  {
    value: "gift_wrapping",
    label: "Gift wrapping",
    description:
      "Bring your own item and let Tap & Wrap prepare the full presentation.",
    icon: Gift
  },
  {
    value: "photo_printing",
    label: "Photo printing",
    description:
      "Print personal photos for gifts, cards, boxes, and memories.",
    icon: Image
  },
  {
    value: "custom_gift",
    label: "Custom gift idea",
    description:
      "Tell us the occasion and budget, and we will help build the gift.",
    icon: Sparkles
  },
  {
    value: "corporate_gifting",
    label: "Corporate gifting",
    description:
      "Branded gifts and quantities for teams, clients, and events.",
    icon: Building2
  },
  {
    value: "other",
    label: "Something else",
    description:
      "A special request that does not fit the normal store options.",
    icon: PackageOpen
  }
];

const inputClassName =
  "w-full rounded-2xl border border-[#ead9d2] bg-white px-4 py-3.5 text-[#2c1f1b] outline-none transition placeholder:text-[#b09a92] focus:border-[#8a675c] focus:ring-4 focus:ring-[#ead9d2]/45";

export default function ServicesPage() {
  const [
    referenceImage,
    setReferenceImage
  ] = useState(null);

  const [
    completedRequest,
    setCompletedRequest
  ] = useState(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: {
      errors
    }
  } = useForm({
    resolver:
      zodResolver(formSchema),

    defaultValues: {
      serviceType:
        "engraving",

      customer: {
        fullName: "",
        email: "",
        phone: "",
        whatsappNumber: ""
      },

      title: "",
      description: "",
      quantity: 1,
      budget: "",
      neededBy: ""
    }
  });

  const selectedService =
    watch("serviceType");

  const mutation = useMutation({
    mutationFn:
      createServiceRequest,

    onSuccess(response) {
      setCompletedRequest(
        response.request
      );

      setReferenceImage(null);
      reset();

      window.scrollTo({
        top: 0,
        behavior: "smooth"
      });
    },

    onError(error) {
      toast.error(
        getServiceRequestErrorMessage(
          error
        )
      );
    }
  });

  function submitRequest(values) {
    mutation.mutate({
      ...values,

      budget:
        values.budget === ""
          ? null
          : Number(
              values.budget
            ),

      neededBy:
        values.neededBy ||
        null,

      referenceImage:
        referenceImage
          ? {
              imageUrl:
                referenceImage.imageUrl,

              imagePublicId:
                referenceImage.imagePublicId,

              originalFileName:
                referenceImage.originalFileName ||
                ""
            }
          : null
    });
  }

  if (completedRequest) {
    return (
      <>
        <Header />

        <main className="mx-auto flex min-h-[65vh] max-w-3xl items-center px-5 py-16">
          <div className="w-full rounded-[2rem] border border-[#ead9d2] bg-white p-9 text-center shadow-sm md:p-12">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-50 text-green-700">
              <CheckCircle2
                size={32}
              />
            </div>

            <p className="mt-6 text-sm font-semibold uppercase tracking-[0.22em] text-[#a77d70]">
              Request received
            </p>

            <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-[#2c1f1b]">
              We’ll review your idea.
            </h1>

            <p className="mx-auto mt-4 max-w-xl leading-7 text-[#735f58]">
              Keep this request number.
              Tap & Wrap can use it when
              discussing the details,
              pricing, and timeline.
            </p>

            <div className="mx-auto mt-7 w-fit rounded-2xl bg-[#2c1f1b] px-6 py-4 text-white">
              <p className="text-xs uppercase tracking-[0.2em] text-white/50">
                Request number
              </p>

              <p className="mt-2 text-xl font-semibold">
                {
                  completedRequest.requestNumber
                }
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                setCompletedRequest(
                  null
                )
              }
              className="mt-8 rounded-full border border-[#ead9d2] px-6 py-3 text-sm font-semibold text-[#5a3d34]"
            >
              Submit another request
            </button>
          </div>
        </main>

        <Footer />
      </>
    );
  }

  return (
    <>
      <Header />

      <main>
        <section className="bg-[#fff8f4] px-5 py-16 md:py-24">
          <div className="mx-auto max-w-7xl">
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[#b08a7c]">
              Custom services
            </p>

            <h1 className="mt-4 max-w-4xl text-5xl font-semibold tracking-[-0.05em] text-[#2c1f1b] md:text-7xl">
              Need something more personal?
            </h1>

            <p className="mt-6 max-w-2xl text-lg leading-8 text-[#735f58]">
              Send the idea, occasion,
              quantity, budget, and a
              reference image. Tap & Wrap
              will review what is possible
              and contact you.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-14">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {serviceOptions.map(
              (service) => {
                const Icon =
                  service.icon;

                const selected =
                  selectedService ===
                  service.value;

                return (
                  <button
                    key={
                      service.value
                    }
                    type="button"
                    onClick={() =>
                      setValue(
                        "serviceType",
                        service.value,
                        {
                          shouldValidate:
                            true
                        }
                      )
                    }
                    className={`rounded-[1.7rem] border p-6 text-left transition ${
                      selected
                        ? "border-[#7b584d] bg-[#2c1f1b] text-white"
                        : "border-[#ead9d2] bg-white text-[#2c1f1b] hover:bg-[#fff8f4]"
                    }`}
                  >
                    <Icon
                      size={25}
                      className={
                        selected
                          ? "text-[#e6c9bf]"
                          : "text-[#8a675c]"
                      }
                    />

                    <h2 className="mt-5 text-xl font-semibold">
                      {service.label}
                    </h2>

                    <p
                      className={`mt-3 leading-7 ${
                        selected
                          ? "text-white/60"
                          : "text-[#735f58]"
                      }`}
                    >
                      {
                        service.description
                      }
                    </p>
                  </button>
                );
              }
            )}
          </div>

          <form
            onSubmit={handleSubmit(
              submitRequest
            )}
            className="mt-10 grid gap-7 lg:grid-cols-[1fr_390px]"
          >
            <div className="grid gap-6">
              <section className="rounded-[2rem] border border-[#ead9d2] bg-white p-6 shadow-sm md:p-8">
                <h2 className="text-2xl font-semibold text-[#2c1f1b]">
                  Contact information
                </h2>

                <div className="mt-6 grid gap-5 md:grid-cols-2">
                  <label className="grid gap-2">
                    <span className="text-sm font-semibold">
                      Full name *
                    </span>

                    <input
                      {...register(
                        "customer.fullName"
                      )}
                      className={
                        inputClassName
                      }
                    />

                    {errors.customer
                      ?.fullName
                      ?.message ? (
                      <span className="text-sm text-red-700">
                        {
                          errors
                            .customer
                            .fullName
                            .message
                        }
                      </span>
                    ) : null}
                  </label>

                  <label className="grid gap-2">
                    <span className="text-sm font-semibold">
                      Email *
                    </span>

                    <input
                      {...register(
                        "customer.email"
                      )}
                      type="email"
                      className={
                        inputClassName
                      }
                    />

                    {errors.customer
                      ?.email?.message ? (
                      <span className="text-sm text-red-700">
                        {
                          errors
                            .customer
                            .email
                            .message
                        }
                      </span>
                    ) : null}
                  </label>

                  <label className="grid gap-2">
                    <span className="text-sm font-semibold">
                      Phone *
                    </span>

                    <input
                      {...register(
                        "customer.phone"
                      )}
                      type="tel"
                      placeholder="01xxxxxxxxx"
                      className={
                        inputClassName
                      }
                    />

                    {errors.customer
                      ?.phone?.message ? (
                      <span className="text-sm text-red-700">
                        {
                          errors
                            .customer
                            .phone
                            .message
                        }
                      </span>
                    ) : null}
                  </label>

                  <label className="grid gap-2">
                    <span className="text-sm font-semibold">
                      WhatsApp
                    </span>

                    <input
                      {...register(
                        "customer.whatsappNumber"
                      )}
                      type="tel"
                      placeholder="Optional"
                      className={
                        inputClassName
                      }
                    />

                    {errors.customer
                      ?.whatsappNumber
                      ?.message ? (
                      <span className="text-sm text-red-700">
                        {
                          errors
                            .customer
                            .whatsappNumber
                            .message
                        }
                      </span>
                    ) : null}
                  </label>
                </div>
              </section>

              <section className="rounded-[2rem] border border-[#ead9d2] bg-white p-6 shadow-sm md:p-8">
                <h2 className="text-2xl font-semibold text-[#2c1f1b]">
                  Request details
                </h2>

                <div className="mt-6 grid gap-5">
                  <label className="grid gap-2">
                    <span className="text-sm font-semibold">
                      Short title *
                    </span>

                    <input
                      {...register(
                        "title"
                      )}
                      placeholder="Example: Engraved perfume bottle for graduation"
                      className={
                        inputClassName
                      }
                    />

                    {errors.title
                      ?.message ? (
                      <span className="text-sm text-red-700">
                        {
                          errors.title
                            .message
                        }
                      </span>
                    ) : null}
                  </label>

                  <label className="grid gap-2">
                    <span className="text-sm font-semibold">
                      Describe your idea *
                    </span>

                    <textarea
                      {...register(
                        "description"
                      )}
                      rows={7}
                      placeholder="Tell us what should be customized, the style, wording, colors, size, occasion, and any important details..."
                      className={
                        inputClassName
                      }
                    />

                    {errors.description
                      ?.message ? (
                      <span className="text-sm text-red-700">
                        {
                          errors
                            .description
                            .message
                        }
                      </span>
                    ) : null}
                  </label>

                  <div className="grid gap-5 md:grid-cols-3">
                    <label className="grid gap-2">
                      <span className="text-sm font-semibold">
                        Quantity
                      </span>

                      <input
                        {...register(
                          "quantity"
                        )}
                        type="number"
                        min="1"
                        className={
                          inputClassName
                        }
                      />
                    </label>

                    <label className="grid gap-2">
                      <span className="text-sm font-semibold">
                        Budget
                      </span>

                      <input
                        {...register(
                          "budget"
                        )}
                        type="number"
                        min="0"
                        placeholder="Optional"
                        className={
                          inputClassName
                        }
                      />
                    </label>

                    <label className="grid gap-2">
                      <span className="text-sm font-semibold">
                        Needed by
                      </span>

                      <input
                        {...register(
                          "neededBy"
                        )}
                        type="date"
                        className={
                          inputClassName
                        }
                      />
                    </label>
                  </div>
                </div>
              </section>
            </div>

            <aside className="h-fit lg:sticky lg:top-28">
              <div className="rounded-[2rem] border border-[#ead9d2] bg-white p-6 shadow-sm">
                <CustomerImageUploader
                  type="service_request"
                  value={
                    referenceImage
                  }
                  onChange={
                    setReferenceImage
                  }
                  label="Reference image"
                  helpText="Optional. Upload a design, product, logo, photo, or visual reference."
                />

                <button
                  type="submit"
                  disabled={
                    mutation.isPending
                  }
                  className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-[#2c1f1b] px-7 py-4 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {mutation.isPending ? (
                    <>
                      <LoaderCircle
                        size={18}
                        className="animate-spin"
                      />
                      Sending request...
                    </>
                  ) : (
                    <>
                      <Sparkles
                        size={18}
                      />
                      Submit request
                    </>
                  )}
                </button>

                <p className="mt-4 text-center text-xs leading-5 text-[#806a62]">
                  Submitting a request does
                  not confirm the final
                  price or production date.
                </p>
              </div>
            </aside>
          </form>
        </section>
      </main>

      <Footer />
    </>
  );
}