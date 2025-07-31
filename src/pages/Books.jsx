import React, { useState, useEffect, useRef } from "react";
import api from "../axiosInstance";
import AddBookForm from "../components/AddBoookForm";
import EditBookForm from "../components/EditBookForm";
import { FaEye, FaTrash, FaPencilAlt } from "react-icons/fa";

function Books() {
  const [books, setBooks] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingBook, setEditingBook] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedBook, setSelectedBook] = useState(null);

  const modalRef = useRef();

  const fetchBooks = async () => {
    try {
      const token = localStorage.getItem("access_token");
      const response = await api.get(
        "https://back-end-for-assessment.vercel.app/books",
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      setBooks(response.data);
    } catch (error) {
      console.error("Error fetching books:", error);
    }
  };

  useEffect(() => {
    fetchBooks();
  }, []);

  // Close modals on clicking outside
  const handleClickOutside = (e) => {
    if (modalRef.current && !modalRef.current.contains(e.target)) {
      setShowAddForm(false);
      setEditingBook(null);
    }
  };

  useEffect(() => {
    if (showAddForm || editingBook) {
      document.addEventListener("mousedown", handleClickOutside);
    } else {
      document.removeEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showAddForm, editingBook]);

  // Filter books by title, author, or genre name
  const filteredBooks = books.filter((book) => {
    const query = searchQuery.toLowerCase();
    return (
      book.title.toLowerCase().includes(query) ||
      book.author.toLowerCase().includes(query) ||
      (book.genre?.name.toLowerCase().includes(query) ?? false)
    );
  });
  const handleViewDetails = async (id) => {
    try {
      const token = localStorage.getItem("access_token");
      const response = await api.get(
        `https://back-end-for-assessment.vercel.app/books/${id}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      setSelectedBook(response.data);
      setShowDetailsModal(true);
    } catch (error) {
      console.error("Failed to fetch book details:", error);
      alert("Failed to load book details");
    }
  };

  // Handlers for after adding or editing books
  const handleBookAdded = () => {
    fetchBooks();
    setShowAddForm(false);
  };

  const handleBookUpdated = (close = true) => {
    fetchBooks();
    if (close) setEditingBook(null);
  };

  // Delete book handler
  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this book?")) return;

    try {
      const token = localStorage.getItem("access_token");
      await api.delete(
        `https://back-end-for-assessment.vercel.app/books/${id}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      fetchBooks();
    } catch (error) {
      console.error("Failed to delete book:", error);
      alert("Failed to delete book");
    }
  };

  return (
    <div className="p-6 relative">
      {/* Search Bar and Add Button */}
      <div className="flex justify-between items-center mb-4">
        <input
          type="text"
          placeholder="Search by title, author, or genre..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="border rounded px-3 py-2 w-72"
        />
        <button
          onClick={() => setShowAddForm(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          Add Book
        </button>
      </div>

      {/* Add Book Modal */}
      {showAddForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-30">
          <div
            ref={modalRef}
            className="bg-white rounded shadow-lg p-6 max-w-md w-full"
          >
            <AddBookForm
              onBookAdded={handleBookAdded}
              onCancel={() => setShowAddForm(false)}
            />
          </div>
        </div>
      )}

      {/* Edit Book Modal */}
      {editingBook && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-30">
          <div
            ref={modalRef}
            className="bg-white rounded shadow-lg p-6 max-w-md w-full"
          >
            <EditBookForm
              book={editingBook}
              onBookUpdated={handleBookUpdated}
            />
          </div>
        </div>
      )}

      {/* Book Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 z-10 relative">
        {filteredBooks.map((book) => {
          const isAvailable = book.available_copies > 0;
          return (
            <div
              key={book.id}
              className="bg-white rounded-xl shadow-md p-4 relative"
            >
              {/* Availability status top-right */}
              <span
                className={`absolute top-3 right-3 px-2 py-1 rounded-full text-xs font-semibold ${
                  isAvailable
                    ? "bg-green-200 text-green-800"
                    : "bg-red-200 text-red-800"
                }`}
              >
                {isAvailable ? "Available" : "Unavailable"}
              </span>

              <h2 className="text-xl font-semibold mb-2">{book.title}</h2>
              <p>
                <strong>Author:</strong> {book.author}
              </p>
              <p>
                <strong>Genre:</strong> {book.genre?.name || "N/A"}
              </p>
              <p>
                <strong>Published:</strong> {book.published_year}
              </p>

              {/* Action icons */}
              <div className="flex justify-end space-x-4 mt-4 text-gray-600">
                <button
                  onClick={() => handleViewDetails(book.id)}
                  title="View Details"
                  className="hover:text-blue-600"
                  aria-label="View details"
                >
                  <FaEye size={18} />
                </button>

                <button
                  onClick={() => setEditingBook(book)}
                  title="Edit Book"
                  className="hover:text-yellow-600"
                  aria-label="Edit book"
                >
                  <FaPencilAlt size={18} />
                </button>

                <button
                  onClick={() => handleDelete(book.id)}
                  title="Delete Book"
                  className="hover:text-red-600"
                  aria-label="Delete book"
                >
                  <FaTrash size={18} />
                </button>
              </div>
            </div>
          );
        })}
        {showDetailsModal && selectedBook && (
          <div
            className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50"
            onClick={() => setShowDetailsModal(false)} // clicking outside closes modal
          >
            <div
              className="bg-white rounded p-6 max-w-md w-full relative"
              onClick={(e) => e.stopPropagation()} // prevent closing when clicking inside modal
            >
              <h2 className="text-2xl font-bold mb-4">{selectedBook.title}</h2>
              <p>
                <strong>Author:</strong> {selectedBook.author}
              </p>
              <p>
                <strong>Genre:</strong> {selectedBook.genre?.name || "N/A"}
              </p>
              <p>
                <strong>Published Year:</strong> {selectedBook.published_year}
              </p>
              <p>
                <strong>Available Copies:</strong>{" "}
                {selectedBook.available_copies}
              </p>

              <button
                className="absolute top-2 right-2 text-gray-600 hover:text-gray-900"
                onClick={() => setShowDetailsModal(false)}
              >
                ✕
              </button>
            </div>
          </div>
        )}
      </div>
      {showDetailsModal && selectedBook && (
        <div
          className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50"
          onClick={() => setShowDetailsModal(false)} // clicking outside closes modal
        >
          <div
            className="bg-white rounded p-6 max-w-md w-full relative"
            onClick={(e) => e.stopPropagation()} // prevent closing when clicking inside modal
          >
            <h2 className="text-2xl font-bold mb-4">{selectedBook.title}</h2>
            <p>
              <strong>Author:</strong> {selectedBook.author}
            </p>
            <p>
              <strong>Genre:</strong> {selectedBook.genre?.name || "N/A"}
            </p>
            <p>
              <strong>Published Year:</strong> {selectedBook.published_year}
            </p>
            <p>
              <strong>Available Copies:</strong> {selectedBook.available_copies}
            </p>

            <button
              className="absolute top-2 right-2 text-gray-600 hover:text-gray-900"
              onClick={() => setShowDetailsModal(false)}
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default Books;
