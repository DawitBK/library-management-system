import React, { useState, useEffect } from "react";
import api from "../axiosInstance";
import { Pencil, Trash2, Eye, Plus } from "lucide-react";

const roles = ["admin", "librarian"];

function StaffPage() {
  const [staffList, setStaffList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [showModal, setShowModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [currentStaff, setCurrentStaff] = useState(null);

  const [formData, setFormData] = useState({
    username: "",
    email: "",
    phone: "",
    role: "librarian",
    password: "",
    confirmPassword: "",
  });

  useEffect(() => {
    fetchStaff();
  }, []);

  const fetchStaff = async () => {
    setLoading(true);
    try {
      const res = await api.get("/auth/users");
      const data = Array.isArray(res.data) ? res.data : res.data.users || [];
      setStaffList(data);
    } catch (err) {
      console.error("Fetch error:", err);
      setError("Failed to load staff");
    } finally {
      setLoading(false);
    }
  };

  const openAddModal = () => {
    setEditMode(false);
    setFormData({
      username: "",
      email: "",
      phone: "",
      role: "librarian",
      password: "",
      confirmPassword: "",
    });
    setShowModal(true);
  };

  const openEditModal = (staff) => {
    setEditMode(true);
    setCurrentStaff(staff);
    setFormData({
      username: staff.username,
      email: staff.email,
      phone: staff.phone || "",
      role: staff.role,
      password: "",
      confirmPassword: "",
    });
    setShowModal(true);
  };

  const handleChange = (e) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const validateForm = () => {
    if (!formData.username || !formData.email || !formData.role) {
      alert("Please fill all required fields");
      return false;
    }
    if (!editMode) {
      if (
        !formData.password ||
        formData.password !== formData.confirmPassword
      ) {
        alert("Password missing or does not match");
        return false;
      }
    } else if (
      formData.password &&
      formData.password !== formData.confirmPassword
    ) {
      alert("Passwords do not match");
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    try {
      const payload = {
        username: formData.username,
        email: formData.email,
        role: formData.role,
      };
      if (formData.password) payload.password = formData.password;

      console.log("Submitting staff:", payload);

      if (editMode && currentStaff?.id) {
        await api.patch(`/staff/${currentStaff.id}`, payload);
      } else {
        await api.post("/staff", payload);
      }

      setShowModal(false);
      fetchStaff();
    } catch (err) {
      console.error("Save error:", err.response?.data || err.message);
      alert(
        "Failed to save staff: " + (err.response?.data?.message || err.message)
      );
    }
  };

  return (
    <div className="p-6">
      <div className="flex justify-between mb-4 items-center">
        <h1 className="text-2xl font-bold">Staff Management</h1>
        <button
          onClick={openAddModal}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded flex items-center"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Staff
        </button>
      </div>

      {loading && <p>Loading...</p>}
      {error && <p className="text-red-500">{error}</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {staffList.map((staff) => (
          <div
            key={staff.id || staff._id}
            className="border p-4 rounded-lg shadow relative bg-white"
          >
            <h2 className="text-xl font-bold">{staff.username}</h2>
            <p>{staff.email}</p>
            <p className="capitalize">{staff.role}</p>
            <p>{staff.phone || "N/A"}</p>

            <div className="absolute top-2 right-2 flex space-x-2">
              <Eye
                className="cursor-pointer text-blue-500"
                title="View"
                onClick={() => alert(JSON.stringify(staff, null, 2))}
              />
              <Pencil
                className="cursor-pointer text-green-600"
                title="Edit"
                onClick={() => openEditModal(staff)}
              />
              <Trash2
                className="cursor-pointer text-red-600"
                title="Delete"
                onClick={() => handleDelete(staff.id || staff._id)}
              />
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
          <div className="bg-white p-6 rounded shadow-lg w-full max-w-md relative">
            <h2 className="text-xl font-semibold mb-4">
              {editMode ? "Edit Staff" : "Add New Staff"}
            </h2>
            <div className="space-y-3">
              {["username", "email", "phone"].map((field) => (
                <input
                  key={field}
                  name={field}
                  placeholder={field.charAt(0).toUpperCase() + field.slice(1)}
                  value={formData[field]}
                  onChange={handleChange}
                  className="w-full p-2 border rounded"
                />
              ))}
              <select
                name="role"
                value={formData.role}
                onChange={handleChange}
                className="w-full p-2 border rounded"
              >
                {roles.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
              <input
                name="password"
                type="password"
                placeholder="Password"
                value={formData.password}
                onChange={handleChange}
                className="w-full p-2 border rounded"
              />
              <input
                name="confirmPassword"
                type="password"
                placeholder="Confirm Password"
                value={formData.confirmPassword}
                onChange={handleChange}
                className="w-full p-2 border rounded"
              />
            </div>
            <div className="flex justify-between mt-4">
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

export default StaffPage;
