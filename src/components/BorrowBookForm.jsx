import React, { useState, useEffect } from "react";
import api from "../axiosInstance";

export default function BorrowBookForm({ onClose }) {
  const [books, setBooks] = useState([]);
  const [members, setMembers] = useState([]);
  const [bookId, setBookId] = useState("");
  const [memberId, setMemberId] = useState("");
  const [dueDate, setDueDate] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    const fetchData = async () => {
      try {
        const [booksRes, membersRes] = await Promise.all([
          api.get("https://back-end-for-assessment.vercel.app/books", {
            headers: { Authorization: `Bearer ${token}` },
          }),
          api.get("https://back-end-for-assessment.vercel.app/members", {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);
        setBooks(booksRes.data);
        setMembers(membersRes.data);
      } catch (error) {
        console.error("Error fetching data:", error);
      }
    };
    fetchData();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem("access_token");

    try {
      await api.post(
        "https://back-end-for-assessment.vercel.app/borrow-records/borrow",
        {
          book_id: Number(bookId),
          member_id: Number(memberId),
          due_date: dueDate,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      alert("Book borrowed successfully!");
      onClose();
    } catch (error) {
      console.error("Borrow failed:", error);
      alert("Borrow failed");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h2 className="text-xl font-bold mb-4">Borrow a Book</h2>

      <label className="block">
        Select Book
        <select
          required
          value={bookId}
          onChange={(e) => setBookId(e.target.value)}
          className="w-full border px-3 py-2 rounded mt-1"
        >
          <option value="">-- Select Book --</option>
          {books.map((book) => (
            <option key={book.id} value={book.id}>
              {book.title}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        Select Member
        <select
          required
          value={memberId}
          onChange={(e) => setMemberId(e.target.value)}
          className="w-full border px-3 py-2 rounded mt-1"
        >
          <option value="">-- Select Member --</option>
          {members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        Due Date
        <input
          type="date"
          required
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="w-full border px-3 py-2 rounded mt-1"
        />
      </label>

      <div className="flex justify-between">
        <button
          type="submit"
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          Borrow
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
