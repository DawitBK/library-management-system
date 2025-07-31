import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

import {
  UserIcon,
  LogOutIcon,
  ShieldCheckIcon,
  BookOpenIcon,
} from "lucide-react";

const Navbar = () => {
  const [user, setUser] = useState(null);
  const [showMenu, setShowMenu] = useState(false);
  const navigate = useNavigate();
  const menuRef = useRef();

  useEffect(() => {
    const storedUser = JSON.parse(localStorage.getItem("user"));
    setUser(storedUser);

    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setShowMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = () => {
    localStorage.clear();
    navigate("/login");
  };

  const getMemberSince = (dateString) => {
    if (!dateString) return "N/A";
    const joinedDate = new Date(dateString);
    const now = new Date();
    const diffYears = now.getFullYear() - joinedDate.getFullYear();
    return `${diffYears} year${diffYears !== 1 ? "s" : ""}`;
  };

  return (
    <nav className="bg-white text-black px-4 py-6 shadow-md relative">
      <div className="max-w-10xl flex justify-between items-center">
        <div className="text-xl font-semibold">Library Manager System</div>
        <div className="flex items-center gap-4">
          <div className="text-lg">Welcome {user?.username}</div>
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="w-10 h-10 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center hover:bg-blue-700"
          >
            {user?.username?.[0]?.toUpperCase() || "U"}
          </button>
        </div>
      </div>

      {showMenu && user && (
        <div
          ref={menuRef}
          className="absolute right-4 top-20 w-80 bg-white shadow-xl rounded-lg p-4 z-50"
        >
          <div className="mb-4">
            <h3 className="text-xl font-bold">{user.username}</h3>
            <h4 className="text-gray-500 capitalize">{user.role}</h4>
          </div>

          <div
            className="flex items-center gap-2 hover:bg-gray-100 px-3 py-2 rounded cursor-pointer"
            onClick={() => {
              navigate("/profile-page");
              setShowMenu(false);
            }}
          >
            <UserIcon className="w-5 h-5" />
            <span>Profile</span>
          </div>

          <div className="border-t my-3" />

          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 text-red-600 hover:bg-red-50 px-3 py-2 rounded"
          >
            <LogOutIcon className="w-5 h-5" />
            Logout
          </button>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
