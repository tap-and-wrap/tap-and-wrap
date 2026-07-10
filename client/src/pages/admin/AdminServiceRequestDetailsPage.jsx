import {
  useEffect,
  useState
} from "react";
import {
  ArrowLeft,
  ExternalLink,
  LoaderCircle,
  Mail,
  Phone,
  Save,
  Sparkles
} from "lucide-react";
import {
  Link,
  useParams
} from "react-router-dom";
import {
  useMutation,
  useQuery,
  useQueryClient
} from "@tanstack/react-query";
import toast from "react-hot-toast";

import LoadingState from "../../components/ui/LoadingState";
import ErrorState from "../../components/ui/ErrorState";

import {
  getAdminServiceRequest,
  getAdminServiceRequestErrorMessage,
  updateAdminServiceRequest
} from "../../features/admin/adminServiceRequestApi";

import {
  formatPrice
} from "../../utils/cartUtils";

const statusLabels = {
  new: "New",
  contacted: "Contacted",
  quoted: "Quoted",
  approved: "Approved",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled"
};

const statusTransitions = {
  new: [
    "contacted",
    "quoted",
    "cancelled"
  ],

  contacted: [
    "quoted",
    "approved",
    "cancelled"
  ],

  quoted: [
    "contacted",
    "approved",
    "cancelled"
  ],

  approved: [
    "in_progress",
    "cancelled"
  ],

  in_progress: [
    "completed",
    "cancelled"
  ],

  completed: [],

  cancelled: []
};

const serviceLabels = {
  engraving:
    "Engraving",

  gift_wrapping:
    "Gift wrapping",

  photo_printing:
    "Photo printing",

  custom_gift:
    "Custom gift",

  corporate_gifting:
    "Corporate gifting",

  other:
    "Other"
};

const inputClassName =
  "w-full rounded-2xl border border-[#e5d8d2] bg-white px-4 py-3 outline-none transition focus:border-[#9a766b]";

function formatDate(value) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat(
    "en-EG",
    {
      dateStyle: "medium",
      timeStyle: "short"
    }
  ).format(new Date(value));
}

export default function AdminServiceRequestDetailsPage() {
  const { id } =
    useParams();

  const queryClient =
    useQueryClient();

  const [
    status,
    setStatus
  ] = useState("");

  const [
    quotedPrice,
    setQuotedPrice
  ] = useState("");

  const [
    adminNote,
    setAdminNote
  ] = useState("");

  const [
    statusNote,
    setStatusNote
  ] = useState("");

  const requestQuery = useQuery({
    queryKey: [
      "admin-service-request",
      id
    ],

    queryFn: () =>
      getAdminServiceRequest(
        id
      )
  });

  const request =
    requestQuery.data
      ?.request;

  useEffect(() => {
    if (!request) {
      return;
    }

    setStatus(
      request.status
    );

    setQuotedPrice(
      request.quotedPrice ??
        ""
    );

    setAdminNote(
      request.adminNote || ""
    );

    setStatusNote("");
  }, [request]);

  const updateMutation =
    useMutation({
      mutationFn:
        updateAdminServiceRequest,

      onSuccess(response) {
        toast.success(
          response.message
        );

        queryClient.invalidateQueries({
          queryKey: [
            "admin-service-request",
            id
          ]
        });

        queryClient.invalidateQueries({
          queryKey: [
            "admin-service-requests"
          ]
        });
      },

      onError(error) {
        toast.error(
          getAdminServiceRequestErrorMessage(
            error
          )
        );
      }
    });

  function handleSubmit(event) {
    event.preventDefault();

    if (
      status === "quoted" &&
      quotedPrice === ""
    ) {
      toast.error(
        "Enter the quoted price"
      );

      return;
    }

    updateMutation.mutate({
      id,

      payload: {
        status,

        quotedPrice:
          quotedPrice === ""
            ? null
            : Number(
                quotedPrice
              ),

        adminNote:
          adminNote.trim(),

        statusNote:
          statusNote.trim()
      }
    });
  }

  if (
    requestQuery.isLoading
  ) {
    return (
      <LoadingState label="Loading service request..." />
    );
  }

  if (
    requestQuery.isError ||
    !request
  ) {
    return (
      <ErrorState message="This service request could not be loaded." />
    );
  }

  const allowedStatuses = [
    request.status,

    ...(statusTransitions[
      request.status
    ] || [])
  ];

  return (
    <div>
      <Link
        to="/admin/services"
        className="inline-flex items-center gap-2 text-sm font-semibold text-[#735f58]"
      >
        <ArrowLeft
          size={17}
        />

        Back to services
      </Link>

      <div className="mt-6 flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#a77d70]">
            {
              serviceLabels[
                request.serviceType
              ]
            }
          </p>

          <h2 className="mt-2 text-4xl font-semibold tracking-[-0.04em]">
            {request.title}
          </h2>

          <p className="mt-3 text-[#735f58]">
            {
              request.requestNumber
            }{" "}
            ·{" "}
            {formatDate(
              request.createdAt
            )}
          </p>
        </div>

        <span className="w-fit rounded-full bg-[#f4e5df] px-4 py-2 text-sm font-semibold text-[#7b584d]">
          {
            statusLabels[
              request.status
            ]
          }
        </span>
      </div>

      <section className="mt-8 grid gap-5 xl:grid-cols-3">
        <article className="rounded-[1.7rem] border border-[#e5d8d2] bg-white p-6 shadow-sm">
          <Mail
            size={22}
            className="text-[#8a675c]"
          />

          <h3 className="mt-5 text-xl font-semibold">
            Customer
          </h3>

          <div className="mt-4 grid gap-2 text-sm text-[#735f58]">
            <p className="font-semibold text-[#2c1f1b]">
              {
                request.customer
                  .fullName
              }
            </p>

            <a
              href={`mailto:${request.customer.email}`}
            >
              {
                request.customer
                  .email
              }
            </a>

            <a
              href={`tel:${request.customer.phone}`}
              className="inline-flex items-center gap-2"
            >
              <Phone size={14} />

              {
                request.customer
                  .phone
              }
            </a>

            {request.customer
              .whatsappNumber ? (
              <a
                href={`https://wa.me/${request.customer.whatsappNumber.replace(/\D/g, "")}`}
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-[#5a3d34]"
              >
                Open WhatsApp
              </a>
            ) : null}
          </div>
        </article>

        <article className="rounded-[1.7rem] border border-[#e5d8d2] bg-white p-6 shadow-sm">
          <Sparkles
            size={22}
            className="text-[#8a675c]"
          />

          <h3 className="mt-5 text-xl font-semibold">
            Request
          </h3>

          <div className="mt-4 grid gap-2 text-sm text-[#735f58]">
            <p>
              Quantity:{" "}
              <strong>
                {
                  request.quantity
                }
              </strong>
            </p>

            <p>
              Budget:{" "}
              <strong>
                {request.budget !==
                null
                  ? formatPrice(
                      request.budget
                    )
                  : "Not provided"}
              </strong>
            </p>

            <p>
              Needed by:{" "}
              <strong>
                {request.neededBy
                  ? formatDate(
                      request.neededBy
                    )
                  : "Flexible"}
              </strong>
            </p>
          </div>
        </article>

        <article className="rounded-[1.7rem] border border-[#e5d8d2] bg-white p-6 shadow-sm">
          <h3 className="text-xl font-semibold">
            Quote
          </h3>

          <p className="mt-5 text-3xl font-semibold text-[#2c1f1b]">
            {request.quotedPrice !==
            null
              ? formatPrice(
                  request.quotedPrice
                )
              : "Not quoted"}
          </p>

          {request.referenceImage
            ?.imageUrl ? (
            <a
              href={
                request
                  .referenceImage
                  .imageUrl
              }
              target="_blank"
              rel="noreferrer"
              className="mt-5 inline-flex items-center gap-2 rounded-full border border-[#e5d8d2] px-4 py-2 text-sm font-semibold text-[#5a3d34]"
            >
              <ExternalLink
                size={15}
              />

              Open reference image
            </a>
          ) : null}
        </article>
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1fr_420px]">
        <article className="rounded-[1.8rem] border border-[#e5d8d2] bg-white p-6 shadow-sm">
          <h3 className="text-xl font-semibold">
            Customer description
          </h3>

          <p className="mt-5 whitespace-pre-wrap leading-8 text-[#735f58]">
            {request.description}
          </p>

          {request.statusHistory
            ?.length ? (
            <div className="mt-8 border-t border-[#eee3de] pt-6">
              <h3 className="text-xl font-semibold">
                Status history
              </h3>

              <div className="mt-5 grid gap-3">
                {[...request.statusHistory]
                  .reverse()
                  .map(
                    (entry) => (
                      <div
                        key={
                          entry._id
                        }
                        className="rounded-2xl bg-[#faf7f5] p-4"
                      >
                        <p className="font-semibold">
                          {
                            statusLabels[
                              entry.to
                            ]
                          }
                        </p>

                        <p className="mt-1 text-sm text-[#806a62]">
                          {formatDate(
                            entry.changedAt
                          )}
                        </p>

                        {entry.note ? (
                          <p className="mt-2 text-sm leading-6 text-[#735f58]">
                            {
                              entry.note
                            }
                          </p>
                        ) : null}
                      </div>
                    )
                  )}
              </div>
            </div>
          ) : null}
        </article>

        <form
          onSubmit={handleSubmit}
          className="h-fit rounded-[1.8rem] border border-[#e5d8d2] bg-white p-6 shadow-sm xl:sticky xl:top-28"
        >
          <h3 className="text-xl font-semibold">
            Update request
          </h3>

          <div className="mt-6 grid gap-5">
            <label className="grid gap-2">
              <span className="text-sm font-semibold">
                Status
              </span>

              <select
                value={status}
                onChange={(event) =>
                  setStatus(
                    event.target.value
                  )
                }
                className={
                  inputClassName
                }
              >
                {allowedStatuses.map(
                  (value) => (
                    <option
                      key={value}
                      value={value}
                    >
                      {
                        statusLabels[
                          value
                        ]
                      }
                    </option>
                  )
                )}
              </select>
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-semibold">
                Quoted price
              </span>

              <input
                type="number"
                min="0"
                value={
                  quotedPrice
                }
                onChange={(event) =>
                  setQuotedPrice(
                    event.target.value
                  )
                }
                placeholder="Optional"
                className={
                  inputClassName
                }
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-semibold">
                Internal note
              </span>

              <textarea
                rows={5}
                value={
                  adminNote
                }
                onChange={(event) =>
                  setAdminNote(
                    event.target.value
                  )
                }
                className={
                  inputClassName
                }
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-semibold">
                Status-change note
              </span>

              <textarea
                rows={3}
                value={
                  statusNote
                }
                onChange={(event) =>
                  setStatusNote(
                    event.target.value
                  )
                }
                placeholder="Optional history note"
                className={
                  inputClassName
                }
              />
            </label>

            <button
              type="submit"
              disabled={
                updateMutation.isPending
              }
              className="flex items-center justify-center gap-2 rounded-full bg-[#2c1f1b] px-6 py-3.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {updateMutation.isPending ? (
                <LoaderCircle
                  size={17}
                  className="animate-spin"
                />
              ) : (
                <Save size={17} />
              )}

              Save update
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}