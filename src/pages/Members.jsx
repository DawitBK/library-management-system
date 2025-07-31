import React, { useState, useEffect } from "react";
import api from "../axiosInstance";

function MembersPage() {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [showModal, setShowModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [currentMember, setCurrentMember] = useState(null);

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    join_date: "",
  });

  const fetchMembers = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get("/members");
      setMembers(res.data);
    } catch (err) {
      setError("Failed to fetch members");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMembers();
  }, []);

  const openAddModal = () => {
    setEditMode(false);
    setFormData({ name: "", email: "", phone: "", join_date: "" });
    setShowModal(true);
  };

  const openEditModal = (member) => {
    setEditMode(true);
    setCurrentMember(member);
    setFormData({
      name: member.name,
      email: member.email,
      phone: member.phone,
    });
    setShowModal(true);
  };

  const handleChange = (e) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async () => {
    if (!formData.name || !formData.email || !formData.phone) {
      alert("Name, Email, and Phone are required");
      return;
    }

    try {
      if (editMode) {
        // Don't include join_date in update
        const { name, email, phone } = formData;
        await api.patch(`/members/${currentMember.id}`, { name, email, phone });
      } else {
        // Add join_date when creating
        const newMember = {
          ...formData,
          join_date: new Date().toISOString().split("T")[0],
        };
        await api.post("/members", newMember);
      }
      setShowModal(false);
      fetchMembers();
    } catch (err) {
      console.error(" Error saving member:", err.response?.data || err.message);
      alert("Error saving member");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this member?")) return;
    try {
      await api.delete(`/members/${id}`);
      fetchMembers();
    } catch (err) {
      alert("Error deleting member");
    }
  };

  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold">Members</h2>
        <button
          onClick={openAddModal}
          className="bg-blue-600 text-white px-4 py-2 rounded"
        >
          + Add Member
        </button>
      </div>

      {loading && <p>Loading members...</p>}
      {error && <p className="text-red-500">{error}</p>}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {members.map((member) => (
          <div
            key={member.id}
            className="border rounded p-4 shadow flex flex-col justify-between"
          >
            <div>
              <h3 className="font-semibold text-lg">{member.name}</h3>
              <p>{member.email}</p>
              <p>{member.phone}</p>
              <p className="text-sm text-gray-600">
                Joined: {member.join_date}
              </p>
            </div>
            <div className="mt-4 flex justify-end space-x-2">
              <button
                onClick={() => openEditModal(member)}
                className="text-blue-600 hover:underline"
              >
                Edit
              </button>
              <button
                onClick={() => handleDelete(member.id)}
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
              {editMode ? "Edit Member" : "Add Member"}
            </h3>

            <label className="block mb-2">
              Name <span className="text-red-500">*</span>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                className="w-full border rounded px-3 py-2 mt-1"
              />
            </label>

            <label className="block mb-2">
              Email <span className="text-red-500">*</span>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                className="w-full border rounded px-3 py-2 mt-1"
              />
            </label>

            <label className="block mb-2">
              Phone
              <input
                type="text"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                className="w-full border rounded px-3 py-2 mt-1"
              />
            </label>

            <label className="block mb-4">
              Join Date <span className="text-red-500">*</span>
              <input
                type="text"
                name="join_date"
                value={formData.join_date}
                onChange={handleChange}
                className="w-full border rounded px-3 py-2 mt-1"
                placeholder="e.g. 2025-07-31"
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

export default MembersPage;
