import React from "react";
import Sidebar from "../components/Sidebar";
import Navbar from "../components/Navbar";
import { Outlet } from "react-router-dom";

const MainLayout = () => {
  return (
    <div className="flex-1 flex flex-col">
      <Navbar />
      <div className="flex h-screen">
        <Sidebar />

        <div className="flex-1 overflow-y-auto bg-gray-100 p-6">
          <Outlet />
        </div>
      </div>
    </div>
  );
};

export default MainLayout;
