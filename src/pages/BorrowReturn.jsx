import React, { useEffect, useState } from "react";
import api from "../axiosInstance";
import BorrowBookForm from "../components/BorrowBookForm";
import ReturnBookForm from "../components/ReturnBookForm";

export default function BorrowReturnPage() {
  const [borrowRecords, setBorrowRecords] = useState([]);
  const [showBorrowModal, setShowBorrowModal] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);

  const fetchBorrowRecords = async () => {
    try {
      const token = localStorage.getItem("access_token");
      const res = await api.get(
        "https://back-end-for-assessment.vercel.app/borrow-records",
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      setBorrowRecords(res.data);
    } catch (error) {
      console.error("Error fetching records:", error);
    }
  };

  useEffect(() => {
    fetchBorrowRecords();
  }, []);

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Borrow/Return Management</h1>

      <div className="flex gap-4 mb-4">
        <button
          onClick={() => setShowBorrowModal(true)}
          className="bg-green-600 text-white px-4 py-2 rounded"
        >
          + Borrow Book
        </button>
        <button
          onClick={() => setShowReturnModal(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded"
        >
          Return Book
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {borrowRecords.map((record) => (
          <div key={record.id} className="border p-4 rounded shadow">
            <h2 className="font-semibold text-lg">{record.book?.title}</h2>
            <p>Borrowed by: {record.member?.name}</p>
            <p>Due: {record.due_date}</p>
            <p>Status: {record.returned ? "Returned" : "Active"}</p>
          </div>
        ))}
      </div>

      {showBorrowModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center">
          <div className="bg-white p-6 rounded shadow-xl w-full max-w-md">
            <BorrowBookForm
              onClose={() => {
                setShowBorrowModal(false);
                fetchBorrowRecords();
              }}
            />
          </div>
        </div>
      )}

      {showReturnModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center">
          <div className="bg-white p-6 rounded shadow-xl w-full max-w-md">
            <ReturnBookForm
              onClose={() => {
                setShowReturnModal(false);
                fetchBorrowRecords();
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
