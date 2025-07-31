import React, { useState, useEffect } from "react";
import api from "../axiosInstance";

function GenresPage() {
  const [genres, setGenres] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [showModal, setShowModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [currentGenre, setCurrentGenre] = useState(null);

  const [formData, setFormData] = useState({
    name: "",
  });

  const fetchGenres = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(
        "https://back-end-for-assessment.vercel.app/genres"
      );
      setGenres(res.data);
    } catch (err) {
      setError("Failed to fetch genres");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGenres();
  }, []);

  const openAddModal = () => {
    setEditMode(false);
    setFormData({ name: "" });
    setShowModal(true);
  };

  const openEditModal = (genre) => {
    setEditMode(true);
    setCurrentGenre(genre);
    setFormData({ name: genre.name });
    setShowModal(true);
  };

  const handleChange = (e) => {
    setFormData({ name: e.target.value });
  };

  const handleSubmit = async () => {
    if (!formData.name) {
      alert("Genre name is required");
      return;
    }

    try {
      if (editMode) {
        await api.patch(
          `https://back-end-for-assessment.vercel.app/genres/${currentGenre.id}`,
          formData
        );
      } else {
        await api.post(
          "https://back-end-for-assessment.vercel.app/genres",
          formData
        );
      }
      setShowModal(false);
      fetchGenres();
    } catch (err) {
      alert("Error saving genre");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this genre?")) return;
    try {
      await api.delete(
        `https://back-end-for-assessment.vercel.app/genres/${id}`
      );
      fetchGenres();
    } catch (err) {
      alert("Error deleting genre");
    }
  };

  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold">Genres</h2>
        <button
          onClick={openAddModal}
          className="bg-blue-600 text-white px-4 py-2 rounded"
        >
          + Add Genre
        </button>
      </div>

      {loading && <p>Loading genres...</p>}
      {error && <p className="text-red-500">{error}</p>}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {genres.map((genre) => (
          <div
            key={genre.id}
            className="border rounded p-4 shadow flex flex-col justify-between"
          >
            <div>
              <h3 className="font-semibold text-lg">{genre.name}</h3>
            </div>
            <div className="mt-4 flex justify-end space-x-2">
              <button
                onClick={() => openEditModal(genre)}
                className="text-blue-600 hover:underline"
              >
                Edit
              </button>
              <button
                onClick={() => handleDelete(genre.id)}
                className="text-red-600 hover:underline"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded p-6 w-full max-w-md">
            <h3 className="text-xl font-semibold mb-4">
              {editMode ? "Edit Genre" : "Add Genre"}
            </h3>

            <label className="block mb-4">
              Name <span className="text-red-500">*</span>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                className="w-full border rounded px-3 py-2 mt-1"
                required
              />
            </label>

            <div className="flex justify-end space-x-2">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 border rounded"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                className="bg-green-600 text-white px-4 py-2 rounded"
              >
                {editMode ? "Update" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default GenresPage;
