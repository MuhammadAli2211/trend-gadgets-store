"use client";

import { useEffect, useState } from "react";

import api from "../../../lib/api";

export default function OrdersPage() {
const [orders, setOrders] = useState([]);

const [stats, setStats] = useState({
total: 0,
pending: 0,
confirmed: 0,
processing: 0,
shipped: 0,
delivered: 0,
cancelled: 0,
revenue: 0,
});

const [loading, setLoading] =
useState(true);

const [error, setError] =
useState("");

const [success, setSuccess] =
useState("");

const [statusFilter, setStatusFilter] =
useState("all");

const [search, setSearch] =
useState("");

const [searchInput, setSearchInput] =
useState("");

// =========================
// LOAD EVERYTHING
// =========================



async function loadData() {
try {


  const query = new URLSearchParams();

  if (
    statusFilter &&
    statusFilter !== "all"
  ) {
    query.append(
      "status",
      statusFilter
    );
  }

  if (search.trim()) {
    query.append(
      "search",
      search.trim()
    );
  }

  const queryString =
    query.toString();

  const [
    ordersResponse,
    statsResponse,
  ] = await Promise.all([
    api.get(
      `/orders${
        queryString
          ? `?${queryString}`
          : ""
      }`
    ),

    api.get(
      "/orders/stats"
    ),
  ]);

  if (
    ordersResponse.data.success
  ) {
    setOrders(
      ordersResponse.data.orders ||
        []
    );
  }

  if (
    statsResponse.data.success
  ) {
    setStats(
      statsResponse.data.stats
    );
  }
} catch (error) {
  console.error(
    "Load Orders Error:",
    error
  );

  setError(
    error.response?.data?.message ||
      "Failed to load orders."
  );
} finally {
  setLoading(false);
}


}

  useEffect(() => {
const timeoutId = setTimeout(() => loadData(), 0);
return () => clearTimeout(timeoutId);
}, [statusFilter, search]);

// =========================
// SEARCH
// =========================

const handleSearch = (e) => {
e.preventDefault();


setSearch(
  searchInput.trim()
);


};

// =========================
// STATUS UPDATE
// =========================

const updateStatus = async (
orderId,
status
) => {
try {
setSuccess("");


  const response =
    await api.put(
      `/orders/${orderId}/status`,
      {
        status,
      }
    );

  if (
    response.data.success
  ) {
    setSuccess(
      "Order status updated successfully."
    );

    setOrders((prev) =>
      prev.map((order) =>
        order._id === orderId
          ? {
              ...order,
              status,
            }
          : order
      )
    );

    // Refresh stats
    const statsResponse =
      await api.get(
        "/orders/stats"
      );

    if (
      statsResponse.data.success
    ) {
      setStats(
        statsResponse.data.stats
      );
    }

    setTimeout(() => {
      setSuccess("");
    }, 2500);
  }
} catch (error) {
  console.error(
    "Update Status Error:",
    error
  );

  setError(
    error.response?.data?.message ||
      "Failed to update order."
  );
}


};

// =========================
// DELETE ORDER
// =========================

const deleteOrder = async (
orderId
) => {
const confirmed =
window.confirm(
"Are you sure you want to delete this order?"
);


if (!confirmed) {
  return;
}

try {
  setSuccess("");

  const response =
    await api.delete(
      `/orders/${orderId}`
    );

  if (
    response.data.success
  ) {
    setOrders((prev) =>
      prev.filter(
        (order) =>
          order._id !== orderId
      )
    );

    setSuccess(
      "Order deleted successfully."
    );

    const statsResponse =
      await api.get(
        "/orders/stats"
      );

    if (
      statsResponse.data.success
    ) {
      setStats(
        statsResponse.data.stats
      );
    }

    setTimeout(() => {
      setSuccess("");
    }, 2500);
  }
} catch (error) {
  console.error(
    "Delete Order Error:",
    error
  );

  setError(
    error.response?.data?.message ||
      "Failed to delete order."
  );
}


};

// =========================
// WHATSAPP
// =========================

const openWhatsApp = (
phone,
order
) => {
if (!phone) {
return;
}


let cleanPhone =
  String(phone).replace(
    /[^0-9+]/g,
    ""
  );

if (
  cleanPhone.startsWith("03")
) {
  cleanPhone =
    "92" +
    cleanPhone.substring(1);
}

const message =
  `Assalam o Alaikum ${order.customerName},\n\n` +
  `Regarding your order:\n` +
  `Product: ${order.productName}\n` +
  `Quantity: ${order.quantity}\n` +
  `Total: Rs. ${Number(
    order.totalAmount || 0
  ).toLocaleString()}\n\n` +
  `Thank you.`;

const url =
  `https://wa.me/${cleanPhone}` +
  `?text=${encodeURIComponent(
    message
  )}`;

window.open(
  url,
  "_blank"
);


};

// =========================
// STATUS STYLE
// =========================

const getStatusClass = (
status
) => {
switch (status) {
case "pending":
return "bg-yellow-100 text-yellow-700";


  case "confirmed":
    return "bg-blue-100 text-blue-700";

  case "processing":
    return "bg-purple-100 text-purple-700";

  case "shipped":
    return "bg-indigo-100 text-indigo-700";

  case "delivered":
    return "bg-green-100 text-green-700";

  case "cancelled":
    return "bg-red-100 text-red-700";

  default:
    return "bg-gray-100 text-gray-700";
}


};

// =========================
// FORMAT DATE
// =========================

const formatDate = (
date
) => {
if (!date) {
return "-";
}


return new Date(
  date
).toLocaleString();


};

// =========================
// FORMAT SOURCE
// =========================

const formatSource = (
source
) => {
if (!source) {
return "Website";
}



return (
  source.charAt(0).toUpperCase() +
  source.slice(1)
);


};

return ( <main className="min-h-screen bg-gray-50 p-6 md:p-8">


  {/* =========================
      HEADER
  ========================= */}

  <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">

    <div>
      <h1 className="text-3xl font-bold text-gray-900">
        Orders & Leads
      </h1>

      <p className="mt-1 text-sm text-gray-500">
        Manage customer orders,
        leads and sales.
      </p>
    </div>

    <button
      type="button"
      onClick={loadData}
      className="rounded-xl bg-black px-5 py-3 font-semibold text-white hover:bg-gray-800"
    >
      ↻ Refresh
    </button>
  </div>

  {/* =========================
      SUCCESS
  ========================= */}

  {success && (
    <div className="mb-5 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-700">
      {success}
    </div>
  )}

  {/* =========================
      ERROR
  ========================= */}

  {error && (
    <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
      {error}
    </div>
  )}

  {/* =========================
      STATS
  ========================= */}

  <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-7">

    <StatCard
      title="Total"
      value={stats.total}
    />

    <StatCard
      title="Pending"
      value={stats.pending}
    />

    <StatCard
      title="Confirmed"
      value={stats.confirmed}
    />

    <StatCard
      title="Processing"
      value={stats.processing}
    />

    <StatCard
      title="Shipped"
      value={stats.shipped}
    />

    <StatCard
      title="Delivered"
      value={stats.delivered}
    />

    <StatCard
      title="Cancelled"
      value={stats.cancelled}
    />
  </div>

  {/* =========================
      REVENUE
  ========================= */}

  <div className="mb-8 rounded-2xl bg-white p-6 shadow-sm">

    <p className="text-sm text-gray-500">
      Total Revenue
    </p>

    <p className="mt-2 text-3xl font-bold text-gray-900">
      Rs.{" "}
      {Number(
        stats.revenue || 0
      ).toLocaleString()}
    </p>

  </div>

  {/* =========================
      FILTERS
  ========================= */}

  <div className="mb-6 rounded-2xl bg-white p-5 shadow-sm">

    <div className="flex flex-col gap-4 lg:flex-row lg:items-end">

      {/* SEARCH */}

      <form
        onSubmit={handleSearch}
        className="flex flex-1 gap-2"
      >
        <input
          type="text"
          value={searchInput}
          onChange={(e) =>
            setSearchInput(
              e.target.value
            )
          }
          placeholder="Search customer, phone or product..."
          className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-black"
        />

        <button
          type="submit"
          className="rounded-xl bg-black px-6 py-3 font-semibold text-white hover:bg-gray-800"
        >
          Search
        </button>
      </form>

      {/* STATUS */}

      <div className="w-full lg:w-56">
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Status
        </label>

        <select
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(
              e.target.value
            )
          }
          className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-black"
        >
          <option value="all">
            All Orders
          </option>

          <option value="pending">
            Pending
          </option>

          <option value="confirmed">
            Confirmed
          </option>

          <option value="processing">
            Processing
          </option>

          <option value="shipped">
            Shipped
          </option>

          <option value="delivered">
            Delivered
          </option>

          <option value="cancelled">
            Cancelled
          </option>
        </select>
      </div>

    </div>
  </div>

  {/* =========================
      ORDERS
  ========================= */}

  <div className="rounded-2xl bg-white shadow-sm">

    <div className="border-b p-5">
      <h2 className="text-xl font-bold">
        Orders
      </h2>

      <p className="mt-1 text-sm text-gray-500">
        {orders.length} order
        {orders.length === 1
          ? ""
          : "s"} found
      </p>
    </div>

    {loading ? (
      <div className="p-10 text-center">
        <p className="font-medium">
          Loading orders...
        </p>
      </div>
    ) : orders.length === 0 ? (
      <div className="p-10 text-center">
        <div className="text-4xl">
          📦
        </div>

        <h3 className="mt-3 text-lg font-semibold">
          No orders found
        </h3>

        <p className="mt-1 text-sm text-gray-500">
          Orders created from the
          product page will appear
          here.
        </p>
      </div>
    ) : (
      <div className="overflow-x-auto">

        <table className="min-w-[1200px] w-full">

          <thead>
            <tr className="border-b bg-gray-50 text-left text-sm text-gray-500">

              <th className="px-5 py-4">
                Customer
              </th>

              <th className="px-5 py-4">
                Product
              </th>

              <th className="px-5 py-4">
                Qty
              </th>

              <th className="px-5 py-4">
                Total
              </th>

              <th className="px-5 py-4">
                Source
              </th>

              <th className="px-5 py-4">
                Status
              </th>

              <th className="px-5 py-4">
                Date
              </th>

              <th className="px-5 py-4">
                Actions
              </th>

            </tr>
          </thead>

          <tbody>

            {orders.map(
              (order) => (
                <tr
                  key={
                    order._id
                  }
                  className="border-b last:border-0 hover:bg-gray-50"
                >

                  {/* CUSTOMER */}

                  <td className="px-5 py-5">

                    <div className="font-semibold text-gray-900">
                      {
                        order.customerName
                      }
                    </div>

                    <div className="mt-1 text-sm text-gray-500">
                      {
                        order.customerPhone
                      }
                    </div>

                    {order.customerAddress && (
                      <div className="mt-1 max-w-xs text-xs text-gray-400">
                        {
                          order.customerAddress
                        }
                      </div>
                    )}

                  </td>

                  {/* PRODUCT */}

                  <td className="px-5 py-5">

                    <div className="font-medium text-gray-900">
                      {
                        order.productName ||
                          order.product?.name ||
                          "-"
                      }
                    </div>

                    <div className="mt-1 text-xs text-gray-500">
                      Rs.{" "}
                      {Number(
                        order.price ||
                          0
                      ).toLocaleString()}
                    </div>

                  </td>

                  {/* QUANTITY */}

                  <td className="px-5 py-5">
                    {order.quantity}
                  </td>

                  {/* TOTAL */}

                  <td className="px-5 py-5 font-semibold">
                    Rs.{" "}
                    {Number(
                      order.totalAmount ||
                        0
                    ).toLocaleString()}
                  </td>

                  {/* SOURCE */}

                  <td className="px-5 py-5">
                    <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
                      {formatSource(
                        order.source
                      )}
                    </span>
                  </td>

                  {/* STATUS */}

                  <td className="px-5 py-5">

                    <select
                      value={
                        order.status
                      }
                      onChange={(e) =>
                        updateStatus(
                          order._id,
                          e.target.value
                        )
                      }
                      className={`rounded-lg border-0 px-3 py-2 text-xs font-semibold outline-none ${getStatusClass(
                        order.status
                      )}`}
                    >

                      <option value="pending">
                        Pending
                      </option>

                      <option value="confirmed">
                        Confirmed
                      </option>

                      <option value="processing">
                        Processing
                      </option>

                      <option value="shipped">
                        Shipped
                      </option>

                      <option value="delivered">
                        Delivered
                      </option>

                      <option value="cancelled">
                        Cancelled
                      </option>

                    </select>

                  </td>

                  {/* DATE */}

                  <td className="px-5 py-5 text-sm text-gray-500">
                    {formatDate(
                      order.createdAt
                    )}
                  </td>

                  {/* ACTIONS */}

                  <td className="px-5 py-5">

                    <div className="flex flex-wrap gap-2">

                      <button
                        type="button"
                        onClick={() =>
                          openWhatsApp(
                            order.customerPhone,
                            order
                          )
                        }
                        className="rounded-lg bg-green-600 px-3 py-2 text-xs font-semibold text-white hover:bg-green-700"
                      >
                        WhatsApp
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          deleteOrder(
                            order._id
                          )
                        }
                        className="rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-100"
                      >
                        Delete
                      </button>

                    </div>

                  </td>

                </tr>
              )
            )}

          </tbody>

        </table>

      </div>
    )}

  </div>
</main>


);
}

// ======================================================
// STAT CARD
// ======================================================

function StatCard({
title,
value,
}) {
return ( <div className="rounded-2xl bg-white p-5 shadow-sm">



  <p className="text-sm text-gray-500">
    {title}
  </p>

  <p className="mt-2 text-2xl font-bold text-gray-900">
    {Number(
      value || 0
    ).toLocaleString()}
  </p>

</div>


);
}
