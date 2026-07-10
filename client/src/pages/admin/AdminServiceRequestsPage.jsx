import {
  useState
} from "react";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  Search,
  Sparkles
} from "lucide-react";
import {
  Link
} from "react-router-dom";
import {
  useQuery
} from "@tanstack/react-query";

import LoadingState from "../../components/ui/LoadingState";
import ErrorState from "../../components/ui/ErrorState";

import {
  getAdminServiceRequests
} from "../../features/admin/adminServiceRequestApi";

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

const statusLabels = {
  new: "New",
  contacted: "Contacted",
  quoted: "Quoted",
  approved: "Approved",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled"
};

const statusClasses = {
  new:
    "bg-amber-50 text-amber-800",

  contacted:
    "bg-blue-50 text-blue-800",

  quoted:
    "bg-violet-50 text-violet-800",

  approved:
    "bg-cyan-50 text-cyan-800",

  in_progress:
    "bg-indigo-50 text-indigo-800",

  completed:
    "bg-green-50 text-green-800",

  cancelled:
    "bg-red-50 text-red-800"
};

function formatDate(value) {
  return new Intl.DateTimeFormat(
    "en-EG",
    {
      dateStyle: "medium",
      timeStyle: "short"
    }
  ).format(new Date(value));
}

export default function AdminServiceRequestsPage() {
  const [
    draftSearch,
    setDraftSearch
  ] = useState("");

  const [
    search,
    setSearch
  ] = useState("");

  const [
    status,
    setStatus
  ] = useState("all");

  const [
    serviceType,
    setServiceType
  ] = useState("all");

  const [
    page,
    setPage
  ] = useState(1);

  const requestQuery = useQuery({
    queryKey: [
      "admin-service-requests",
      search,
      status,
      serviceType,
      page
    ],

    queryFn: () =>
      getAdminServiceRequests({
        search,
        status,
        serviceType,
        page,
        limit: 20
      })
  });

  const requests =
    requestQuery.data
      ?.requests || [];

  const pagination =
    requestQuery.data
      ?.pagination;

  function handleSearch(event) {
    event.preventDefault();

    setSearch(
      draftSearch.trim()
    );

    setPage(1);
  }

  return (
    <div>
      <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#a77d70]">
            Custom requests
          </p>

          <h2 className="mt-2 text-4xl font-semibold tracking-[-0.04em]">
            Services inbox
          </h2>

          <p className="mt-3 max-w-2xl leading-7 text-[#735f58]">
            Review custom engraving,
            wrapping, printing, corporate,
            and special gift requests.
          </p>
        </div>

        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-[#dfd1ca] bg-white px-4 py-2.5 text-sm font-semibold text-[#5a3d34]">
          <Sparkles size={17} />

          {pagination?.total || 0} requests
        </div>
      </div>

      <section className="mt-8 rounded-[1.7rem] border border-[#e5d8d2] bg-white p-5 shadow-sm">
        <form
          onSubmit={handleSearch}
          className="flex flex-col gap-3 lg:flex-row"
        >
          <div className="relative flex-1">
            <Search
              size={18}
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#9a8178]"
            />

            <input
              value={
                draftSearch
              }
              onChange={(event) =>
                setDraftSearch(
                  event.target.value
                )
              }
              placeholder="Search request number, customer, email, phone, or title..."
              className="w-full rounded-2xl border border-[#e5d8d2] bg-[#faf7f5] py-3 pl-11 pr-4 outline-none"
            />
          </div>

          <button
            type="submit"
            className="rounded-2xl bg-[#2c1f1b] px-6 py-3 text-sm font-semibold text-white"
          >
            Search
          </button>
        </form>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <select
            value={status}
            onChange={(event) => {
              setStatus(
                event.target.value
              );

              setPage(1);
            }}
            className="rounded-2xl border border-[#e5d8d2] bg-white px-4 py-3 outline-none"
          >
            <option value="all">
              All statuses
            </option>

            {Object.entries(
              statusLabels
            ).map(
              ([
                value,
                label
              ]) => (
                <option
                  key={value}
                  value={value}
                >
                  {label}
                </option>
              )
            )}
          </select>

          <select
            value={
              serviceType
            }
            onChange={(event) => {
              setServiceType(
                event.target.value
              );

              setPage(1);
            }}
            className="rounded-2xl border border-[#e5d8d2] bg-white px-4 py-3 outline-none"
          >
            <option value="all">
              All services
            </option>

            {Object.entries(
              serviceLabels
            ).map(
              ([
                value,
                label
              ]) => (
                <option
                  key={value}
                  value={value}
                >
                  {label}
                </option>
              )
            )}
          </select>
        </div>
      </section>

      <section className="mt-6">
        {requestQuery.isLoading ? (
          <LoadingState label="Loading service requests..." />
        ) : null}

        {requestQuery.isError ? (
          <ErrorState message="Service requests could not be loaded." />
        ) : null}

        {!requestQuery.isLoading &&
        !requestQuery.isError &&
        !requests.length ? (
          <div className="rounded-[1.8rem] border border-[#e5d8d2] bg-white p-12 text-center">
            <Sparkles
              size={40}
              className="mx-auto text-[#a98a7f]"
            />

            <h3 className="mt-4 text-xl font-semibold">
              No matching requests
            </h3>
          </div>
        ) : null}

        {!requestQuery.isLoading &&
        !requestQuery.isError &&
        requests.length ? (
          <div className="grid gap-4">
            {requests.map(
              (request) => (
                <article
                  key={
                    request._id
                  }
                  className="grid gap-5 rounded-[1.7rem] border border-[#e5d8d2] bg-white p-5 shadow-sm lg:grid-cols-[1fr_auto]"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-[#2c1f1b]">
                        {
                          request.requestNumber
                        }
                      </p>

                      <span
                        className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                          statusClasses[
                            request
                              .status
                          ]
                        }`}
                      >
                        {
                          statusLabels[
                            request
                              .status
                          ]
                        }
                      </span>

                      <span className="rounded-full bg-[#faf7f5] px-3 py-1.5 text-xs font-semibold text-[#735f58]">
                        {
                          serviceLabels[
                            request
                              .serviceType
                          ]
                        }
                      </span>
                    </div>

                    <h3 className="mt-4 text-xl font-semibold">
                      {request.title}
                    </h3>

                    <p className="mt-3 text-sm text-[#735f58]">
                      {
                        request.customer
                          .fullName
                      }{" "}
                      ·{" "}
                      {
                        request.customer
                          .phone
                      }
                    </p>

                    <p className="mt-2 text-sm text-[#806a62]">
                      Quantity:{" "}
                      {
                        request.quantity
                      }{" "}
                      · Submitted{" "}
                      {formatDate(
                        request.createdAt
                      )}
                    </p>
                  </div>

                  <Link
                    to={`/admin/services/${request._id}`}
                    className="inline-flex h-fit items-center justify-center gap-2 rounded-full border border-[#e5d8d2] px-5 py-2.5 text-sm font-semibold text-[#5a3d34]"
                  >
                    <Eye size={16} />
                    Open
                  </Link>
                </article>
              )
            )}
          </div>
        ) : null}

        {pagination &&
        pagination.totalPages >
          1 ? (
          <div className="mt-6 flex items-center justify-between rounded-2xl border border-[#e5d8d2] bg-white px-5 py-4">
            <p className="text-sm text-[#806a62]">
              Page{" "}
              {pagination.page} of{" "}
              {
                pagination.totalPages
              }
            </p>

            <div className="flex gap-2">
              <button
                type="button"
                disabled={
                  !pagination.hasPreviousPage
                }
                onClick={() =>
                  setPage((value) =>
                    Math.max(
                      value - 1,
                      1
                    )
                  )
                }
                className="rounded-full border border-[#e5d8d2] p-2.5 disabled:opacity-40"
              >
                <ChevronLeft
                  size={18}
                />
              </button>

              <button
                type="button"
                disabled={
                  !pagination.hasNextPage
                }
                onClick={() =>
                  setPage(
                    (value) =>
                      value + 1
                  )
                }
                className="rounded-full border border-[#e5d8d2] p-2.5 disabled:opacity-40"
              >
                <ChevronRight
                  size={18}
                />
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}