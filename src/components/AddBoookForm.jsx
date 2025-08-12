import React, { useState, useEffect } from "react";
import api from "../axiosInstance";

function AddBookForm({ onBookAdded, onCancel }) {
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [publishedYear, setPublishedYear] = useState("");
  const [genreId, setGenreId] = useState("");
  const [availableCopies, setAvailableCopies] = useState(1);
  const [genres, setGenres] = useState([]);

  useEffect(() => {
    const fetchGenres = async () => {
      try {
        const token = localStorage.getItem("access_token");
        const response = await api.get(
          "https://back-end-for-assessment.vercel.app/genres",
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );
        setGenres(response.data);
      } catch (error) {
        console.error("Failed to fetch genres:", error);
      }
    };
    fetchGenres();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem("access_token");

    try {
      await api.post(
        "https://back-end-for-assessment.vercel.app/books",
        {
          title,
          author,
          published_year: Number(publishedYear),
          genre_id: Number(genreId),
          available_copies: Number(availableCopies),
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      onBookAdded();
      // Reset form fields
      setTitle("");
      setAuthor("");
      setPublishedYear("");
      setGenreId("");
      setAvailableCopies(1);
    } catch (error) {
      console.error("Error adding book:", error);
      alert("Failed to add book");
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white shadow-md rounded px-8 pt-6 pb-8 w-full max-w-md"
    >
      <h2 className="text-xl font-bold mb-4">Add New Book</h2>

      <label className="block text-gray-700 mb-1">Title</label>
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        required
        className="w-full border px-3 py-2 rounded mb-4"
      />

      <label className="block text-gray-700 mb-1">Author</label>
      <input
        type="text"
        value={author}
        onChange={(e) => setAuthor(e.target.value)}
        required
        className="w-full border px-3 py-2 rounded mb-4"
      />

      <label className="block text-gray-700 mb-1">Published Year</label>
      <input
        type="number"
        value={publishedYear}
        onChange={(e) => setPublishedYear(e.target.value)}
        required
        className="w-full border px-3 py-2 rounded mb-4"
      />

      <label className="block text-gray-700 mb-1">Genre</label>
      <select
        value={genreId}
        onChange={(e) => setGenreId(e.target.value)}
        required
        className="w-full border px-3 py-2 rounded mb-4"
      >
        <option value="">Select genre</option>
        {genres.map((genre) => (
          <option key={genre.id} value={genre.id}>
            {genre.name}
          </option>
        ))}
      </select>

      <label className="block text-gray-700 mb-1">Available Copies</label>
      <input
        type="number"
        value={availableCopies}
        onChange={(e) => setAvailableCopies(e.target.value)}
        min={0}
        required
        className="w-full border px-3 py-2 rounded mb-6"
      />

      <div className="flex justify-end space-x-2">
        <button
          type="button"
          onClick={onCancel}
          className="bg-gray-400 text-white px-4 py-2 rounded hover:bg-gray-500"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
        >
          Add Book
        </button>
      </div>
    </form>
  );
}

export default AddBookForm;
