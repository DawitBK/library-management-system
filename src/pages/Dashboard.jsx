import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../axiosInstance";

function Dashboard() {
  const navigate = useNavigate();
  const [recentActivities, setRecentActivities] = useState([]);
  const [summary, setSummary] = useState({
    totalBooks: 0,
    totalMembers: 0,
    activeBorrows: 0,
    overdueBooks: 0,
  });
  const [user, setUser] = useState(null);

  useEffect(() => {
    const storedUser = JSON.parse(localStorage.getItem("user"));
    setUser(storedUser);

    const fetchRecentActivities = async () => {
      try {
        const res = await api.get("/borrow-records?limit=5");
        setRecentActivities(res.data);
      } catch (error) {
        console.error("Failed to fetch recent borrow/return records:", error);
      }
    };

    const fetchSummaryData = async () => {
      try {
        // Fetch total books
        const booksRes = await api.get("/books");
        const totalBooks = Array.isArray(booksRes.data)
          ? booksRes.data.length
          : 0;

        // Fetch total members
        const membersRes = await api.get("/members");
        const totalMembers = Array.isArray(membersRes.data)
          ? membersRes.data.length
          : 0;

        // Fetch borrow records
        const borrowsRes = await api.get("/borrow-records");
        const borrowRecords = Array.isArray(borrowsRes.data)
          ? borrowsRes.data
          : [];

        // Count active borrows (books not yet returned)
        const activeBorrows = borrowRecords.filter(
          (r) => r.returned === false || r.return_date === null
        ).length;

        // Count overdue books: returned === false && due_date < today
        const today = new Date();
        const overdueBooks = borrowRecords.filter((r) => {
          if (!r.returned && r.due_date) {
            const dueDate = new Date(r.due_date);
            return dueDate < today;
          }
          return false;
        }).length;

        setSummary({
          totalBooks,
          totalMembers,
          activeBorrows,
          overdueBooks,
        });
      } catch (error) {
        console.error("Failed to fetch summary data:", error);
      }
    };

    fetchRecentActivities();
    fetchSummaryData();
  }, []);

  const isAdmin = user?.role === "admin";

  return (
    <main className="flex-1 bg-gray-100 p-6 space-y-6">
      <h1 className="text-3xl font-bold text-gray-800">
        {isAdmin ? "Admin Dashboard" : "Librarian Dashboard"}
      </h1>
      <p className="whitespace-pre-line text-sm text-gray-500">
        {isAdmin
          ? "ADMINISTRATOR\nFull system access - Manage all library operations"
          : "LIBRARIAN\nStandard library operations - Books, members, and borrowing"}
      </p>

      <div className="bg-red-500 text-white p-4 rounded shadow">
        {isAdmin ? (
          <>
            <strong>Administrator Access</strong>
            <br />
            You have full system privileges including delete operations, genre
            management, and staff administration.
          </>
        ) : (
          <div className="bg-green-500 text-white p-4 rounded shadow">
            <strong>Librarian Access</strong>
            <br />
            You can manage books and members, handle borrowing operations, and
            view reports. Contact admin for advanced operations.
          </div>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded shadow text-center">
          <h2 className="text-lg font-semibold text-gray-700">Total Books</h2>
          <p className="text-2xl font-bold text-blue-600">
            {summary.totalBooks}
          </p>
        </div>
        <div className="bg-white p-4 rounded shadow text-center">
          <h2 className="text-lg font-semibold text-gray-700">Total Members</h2>
          <p className="text-2xl font-bold text-blue-600">
            {summary.totalMembers}
          </p>
        </div>
        <div className="bg-white p-4 rounded shadow text-center">
          <h2 className="text-lg font-semibold text-gray-700">
            Active Borrows
          </h2>
          <p className="text-2xl font-bold text-blue-600">
            {summary.activeBorrows}
          </p>
        </div>
        <div className="bg-white p-4 rounded shadow text-center">
          <h2 className="text-lg font-semibold text-gray-700">Overdue Books</h2>
          <p className="text-2xl font-bold text-blue-600">
            {summary.overdueBooks}
          </p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white p-6 rounded shadow">
        <h1 className="text-2xl font-bold text-gray-800 mb-4">Quick Actions</h1>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <button
            onClick={() => navigate("/borrow-return")}
            className="bg-blue-100 p-4 rounded text-center font-semibold text-blue-800 hover:bg-blue-200 transition"
          >
            Borrow Book
          </button>
          <button
            onClick={() => navigate("/borrow-return")}
            className="bg-green-100 p-4 rounded text-center font-semibold text-green-800 hover:bg-green-200 transition"
          >
            Return Book
          </button>
          <button
            onClick={() => navigate("/books")}
            className="bg-green-100 p-4 rounded text-center font-semibold text-green-800 hover:bg-green-200 transition"
          >
            Add Book
          </button>
          <button
            onClick={() => navigate("/genres")}
            className="bg-green-100 p-4 rounded text-center font-semibold text-green-800 hover:bg-green-200 transition"
          >
            Manage Genres
          </button>
          <button
            onClick={() => navigate("/members")}
            className="bg-purple-100 p-4 rounded text-center font-semibold text-purple-800 hover:bg-purple-200 transition"
          >
            Add Member
          </button>
          <button
            onClick={() => navigate("/reports")}
            className="bg-yellow-100 p-4 rounded text-center font-semibold text-yellow-800 hover:bg-yellow-200 transition"
          >
            Admin Reports
          </button>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white p-6 rounded shadow">
        <h1 className="text-2xl font-bold text-gray-800 mb-4">
          Recent Activity
        </h1>
        <div className="space-y-2 max-h-60 overflow-y-auto">
          {recentActivities.length === 0 ? (
            <p>No recent borrow or return activity.</p>
          ) : (
            recentActivities.map((record) => {
              const returned = record.return_date !== null;
              return (
                <div
                  key={record.id}
                  className="bg-gray-100 p-3 rounded shadow-sm flex justify-between"
                >
                  <div>
                    {returned ? "🔄 Returned: " : "📚 Borrowed: "}
                    <strong>"{record.book?.title || "Unknown"}"</strong> by{" "}
                    {record.member?.name || "Unknown"}
                  </div>
                  <div className="text-sm text-gray-600">
                    {returned ? record.return_date : record.borrow_date}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </main>
  );
}

export default Dashboard;
