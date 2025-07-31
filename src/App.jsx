import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";

import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Books from "./pages/Books";
import Members from "./pages/Members";
import Genres from "./pages/Genres";
import BorrowReturn from "./pages/BorrowReturn";
import Reports from "./pages/Reports";
import Staff from "./pages/Staff";
import ProfilePage from "./components/ProfilePage";
import ProtectedRoute from "./components/ProtectedRoute";
import MainLayout from "./layouts/MainLayout";
import NotAuthorized from "./pages/NotAuthorized";

function App() {
  return (
    <Routes>
      {/* Public route */}
      <Route path="/login" element={<Login />} />

      {/* Protected layout for authenticated users */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <MainLayout />
          </ProtectedRoute>
        }
      >
        {/* Shared routes for admin and librarian */}
        <Route
          path="dashboard"
          element={
            <ProtectedRoute allowedRoles={["admin", "librarian"]}>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="books"
          element={
            <ProtectedRoute allowedRoles={["admin", "librarian"]}>
              <Books />
            </ProtectedRoute>
          }
        />
        <Route
          path="not-authorized"
          element={
            <ProtectedRoute allowedRoles={["admin", "librarian"]}>
              <NotAuthorized />
            </ProtectedRoute>
          }
        />
        <Route
          path="members"
          element={
            <ProtectedRoute allowedRoles={["admin"]}>
              <Members />
            </ProtectedRoute>
          }
        />
        <Route
          path="borrow-return"
          element={
            <ProtectedRoute allowedRoles={["admin", "librarian"]}>
              <BorrowReturn />
            </ProtectedRoute>
          }
        />

        {/* Admin-only routes */}
        <Route
          path="staff"
          element={
            <ProtectedRoute allowedRoles={["admin"]}>
              <Staff />
            </ProtectedRoute>
          }
        />
        <Route
          path="genres"
          element={
            <ProtectedRoute allowedRoles={["admin"]}>
              <Genres />
            </ProtectedRoute>
          }
        />
        <Route
          path="reports"
          element={
            <ProtectedRoute allowedRoles={["admin"]}>
              <Reports />
            </ProtectedRoute>
          }
        />

        {/* Everyone can access their profile */}
        <Route
          path="profile-page"
          element={
            <ProtectedRoute allowedRoles={["admin", "librarian"]}>
              <ProfilePage />
            </ProtectedRoute>
          }
        />

        <Route index element={<Navigate to="dashboard" replace />} />
      </Route>

      {/* Fallback routes */}
      <Route path="/not-authorized" element={<NotAuthorized />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

export default App;
