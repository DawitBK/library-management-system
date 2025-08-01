import { Link, useLocation } from "react-router-dom";

function Sidebar() {
  const location = useLocation();

  const role = localStorage.getItem("user_role");

  const navItem = (to, label) => (
    <Link
      key={to}
      to={to}
      className={`block py-2 px-4 rounded transition ${
        location.pathname === to
          ? "bg-blue-600 font-semibold"
          : "hover:bg-gray-700"
      }`}
    >
      {label}
    </Link>
  );

  return (
    <div className="bg-gray-500 text-white p-4 space-y-4 md:min-h-screen">
      {navItem("/", "Dashboard")}
      {navItem("/books", "Books")}
      {navItem("/borrow-return", "Borrow / Return")}

      {role === "admin" && (
        <>
          {navItem("/members", "Members")}
          {navItem("/staff", "Staff")}
          {navItem("/reports", "Reports")}
          {navItem("/genres", "Genres")}
        </>
      )}
    </div>
  );
}

export default Sidebar;
