import React, { useEffect, useState } from "react";
import { ShieldCheckIcon, BookOpenIcon } from "lucide-react";

const ProfilePage = () => {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const storedUser = JSON.parse(localStorage.getItem("user"));
    setUser(storedUser);
  }, []);

  const getMemberSince = (dateString) => {
    if (!dateString) return "N/A";
    const joinedDate = new Date(dateString);
    const now = new Date();
    const diffYears = now.getFullYear() - joinedDate.getFullYear();
    return `${diffYears} year${diffYears !== 1 ? "s" : ""}`;
  };

  if (!user) return null;

  return (
    <div className="p-6 space-y-6">
      <div className="bg-white shadow-md rounded-lg p-6">
        <h2 className="text-2xl font-bold">{user.username}</h2>
        <h3 className="text-gray-500 capitalize mb-4">{user.role}</h3>

        <h2 className="text-xl font-semibold mb-2">Basic Information</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="text-gray-700 font-medium">Username:</div>
          <div>{user.username}</div>
          <div className="text-gray-700 font-medium">Email Address:</div>
          <div>{user.email}</div>
          <div className="text-gray-700 font-medium">Phone Number:</div>
          <div>{user.phone || "N/A"}</div>
          <div className="text-gray-700 font-medium">Role:</div>
          <div>{user.role}</div>
          <div className="text-gray-700 font-medium">Member Since:</div>
          <div>{getMemberSince(user.createdAt)}</div>
        </div>
      </div>

      <div className="bg-white shadow-md rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Permissions and Access</h2>
        <p className="mb-2 text-gray-700">Your current role and permissions:</p>
        <ul className="list-disc pl-5 space-y-1">
          {user.role === "admin" && (
            <>
              <li className="flex items-center gap-2">
                <ShieldCheckIcon className="w-4 h-4 text-blue-600" /> Full
                system administration access
              </li>
              <li className="flex items-center gap-2">
                <ShieldCheckIcon className="w-4 h-4 text-blue-600" /> Manage all
                books, members, and genres
              </li>
              <li className="flex items-center gap-2">
                <ShieldCheckIcon className="w-4 h-4 text-blue-600" /> Delete
                records and manage staff
              </li>
              <li className="flex items-center gap-2">
                <ShieldCheckIcon className="w-4 h-4 text-blue-600" /> Access all
                reports and analytics
              </li>
            </>
          )}
          {user.role === "librarian" && (
            <>
              <li className="flex items-center gap-2">
                <BookOpenIcon className="w-4 h-4 text-green-600" /> Manage books
                and members
              </li>
              <li className="flex items-center gap-2">
                <BookOpenIcon className="w-4 h-4 text-green-600" /> Handle
                borrow/return operations
              </li>
              <li className="flex items-center gap-2">
                <BookOpenIcon className="w-4 h-4 text-green-600" /> View basic
                reports (no deletion or genre management)
              </li>
            </>
          )}
        </ul>
      </div>
    </div>
  );
};

export default ProfilePage;
