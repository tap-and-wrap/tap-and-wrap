import Counter from "../models/Counter.js";

function getDateKey() {
  const date = new Date();

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}${month}${day}`;
}

export async function generateOrderNumber(session) {
  const dateKey = getDateKey();
  const counterKey = `orders-${dateKey}`;

  const counter = await Counter.findOneAndUpdate(
    {
      _id: counterKey
    },
    {
      $inc: {
        sequence: 1
      }
    },
    {
      upsert: true,
      returnDocument: "after",
      setDefaultsOnInsert: true,
      session
    }
  );

  const sequence = String(counter.sequence).padStart(4, "0");

  return `TW-${dateKey}-${sequence}`;
}