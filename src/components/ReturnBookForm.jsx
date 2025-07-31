import React, { useEffect, useState } from "react";
import api from "../axiosInstance";

export default function ReturnBookForm({ onClose }) {
  const [borrowRecords, setBorrowRecords] = useState([]);
  const [selectedRecordId, setSelectedRecordId] = useState("");

  useEffect(() => {
    const fetchBorrowRecords = async () => {
      try {
        const token = localStorage.getItem("access_token");
        const response = await api.get("/borrow-records", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        console.log("Full response from /borrow-records:", response.data);

        const activeRecords = response.data.filter(
          (record) => !record.return_date
        );

        console.log("Unreturned records:", activeRecords);
        setBorrowRecords(activeRecords);
      } catch (error) {
        console.error("Error fetching borrow records:", error);
        alert("Failed to fetch borrow records");
      }
    };

    fetchBorrowRecords();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!selectedRecordId) {
      alert("Please select a book to return.");
      return;
    }

    try {
      const token = localStorage.getItem("access_token");
      await api.post(
        "/borrow-records/return",
        {
          borrow_record_id: parseInt(selectedRecordId),
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      alert("Book returned successfully!");
      onClose();
    } catch (error) {
      console.error("Error during return:", error);
      alert("Return failed");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h2 className="text-xl font-bold mb-4">Return a Book</h2>

      <label className="block">
        Select a Book
        <select
          value={selectedRecordId}
          onChange={(e) => setSelectedRecordId(e.target.value)}
          required
          className="w-full border px-3 py-2 rounded mt-1"
        >
          <option value="">-- Select a book to return --</option>
          {borrowRecords.map((record) => (
            <option key={record.id} value={record.id}>
              📘 {record.book?.title ?? "Unknown Title"} — Borrower:{" "}
              {record.member?.name ?? `ID ${record.member_id}`}
            </option>
          ))}
        </select>
      </label>

      <div className="flex justify-between">
        <button
          type="submit"
          className="bg-green-600 text-white px-4 py-2 rounded"
        >
          Return
        </button>
        <button
          type="button"
          onClick={onClose}
          className="text-gray-600 px-4 py-2"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
