import React from "react";
import Sidebar from "../components/Sidebar";
import Navbar from "../components/Navbar";
import { Outlet } from "react-router-dom";

const MainLayout = () => {
  return (
    <div className="min-h-screen pt-16 md:flex">
      {/* Fixed Navbar */}
      <div className="fixed top-0 left-0 right-0 z-30">
        <Navbar />
      </div>

      {/* Sidebar */}
      <div className="relative w-full md:w-1/4 lg:w-1/5 py-4">
        <Sidebar />
      </div>

      {/* Main Content */}
      <div className="w-full px-4 py-4 md:py-6 md:px-8 bg-gray-100 flex-1">
        <Outlet />
      </div>
    </div>
  );
};

export default MainLayout;
