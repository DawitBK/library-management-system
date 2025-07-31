import React, { useEffect, useState } from "react";
import api from "../axiosInstance";

function Reports() {
  const [summary, setSummary] = useState(null);
  const [overdueBooks, setOverdueBooks] = useState([]);
  const [popularGenres, setPopularGenres] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const calculateSummaryFromRecords = (records) => {
    const totalBorrows = records.length;

    const returnedRecords = records.filter((r) => r.return_date);
    const returnRate =
      totalBorrows > 0 ? returnedRecords.length / totalBorrows : 0;

    const durations = returnedRecords.map((r) => {
      const borrowDate = new Date(r.borrow_date);
      const returnDate = new Date(r.return_date);
      const diffTime = Math.abs(returnDate - borrowDate);
      return diffTime / (1000 * 60 * 60 * 24); // convert ms to days
    });

    const avgDuration =
      durations.length > 0
        ? durations.reduce((sum, d) => sum + d, 0) / durations.length
        : 0;

    return {
      totalBorrows,
      avgDuration: avgDuration.toFixed(1),
      returnRate: returnRate.toFixed(2),
    };
  };

  const fetchReports = async () => {
    setLoading(true);
    setError("");

    try {
      const token = localStorage.getItem("access_token");

      const headers = {
        Authorization: `Bearer ${token}`,
      };

      const [recordsRes, overdueRes, genreRes] = await Promise.all([
        api.get("/borrow-records", { headers }),
        api.get("/borrow-records/reports/overdue", { headers }),
        api.get("/borrow-records/reports/popular-genres", { headers }),
      ]);

      const records = Array.isArray(recordsRes.data) ? recordsRes.data : [];
      const summaryData = calculateSummaryFromRecords(records);

      setSummary(summaryData);
      setOverdueBooks(overdueRes.data || []);
      setPopularGenres(genreRes.data || []);
    } catch (err) {
      console.error(err);
      setError("Failed to load reports. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, []);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Reports</h1>

      {loading && <p>Loading reports...</p>}
      {error && <p className="text-red-600">{error}</p>}

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-white shadow rounded p-4">
            <h2 className="text-lg font-semibold mb-2">Total Borrows</h2>
            <p className="text-2xl">{summary.totalBorrows}</p>
          </div>
          <div className="bg-white shadow rounded p-4">
            <h2 className="text-lg font-semibold mb-2">
              Average Duration (days)
            </h2>
            <p className="text-2xl">{summary.avgDuration}</p>
          </div>
          <div className="bg-white shadow rounded p-4">
            <h2 className="text-lg font-semibold mb-2">Return Rate</h2>
            <p className="text-2xl">{(summary.returnRate * 100).toFixed(1)}%</p>
          </div>
        </div>
      )}

      {/* Overdue Books */}
      <div className="mb-6 bg-white shadow rounded p-4">
        <h2 className="text-xl font-semibold mb-2">Overdue Books</h2>
        {overdueBooks.length > 0 ? (
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-100">
                <th className="border p-2">Book Title</th>
                <th className="border p-2">Borrower</th>
                <th className="border p-2">Due Date</th>
                <th className="border p-2">Days Overdue</th>
              </tr>
            </thead>
            <tbody>
              {overdueBooks.map((book, idx) => (
                <tr key={idx} className="odd:bg-gray-50">
                  <td className="border p-2">{book.book_title}</td>
                  <td className="border p-2">{book.borrower_name}</td>
                  <td className="border p-2">{book.due_date}</td>
                  <td className="border p-2">{book.days_overdue}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>No overdue books.</p>
        )}
      </div>

      {/* Popular Genres */}
      <div className="bg-white shadow rounded p-4">
        <h2 className="text-xl font-semibold mb-2">Popular Genres</h2>
        {popularGenres.length > 0 ? (
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-100">
                <th className="border p-2">Genre</th>
                <th className="border p-2">Borrow Count</th>
              </tr>
            </thead>
            <tbody>
              {popularGenres.map((genre, idx) => (
                <tr key={idx} className="odd:bg-gray-50">
                  <td className="border p-2">{genre.genre_name}</td>
                  <td className="border p-2">{genre.borrow_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>No genre data available.</p>
        )}
      </div>
    </div>
  );
}

export default Reports;
