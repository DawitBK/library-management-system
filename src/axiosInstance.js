import axios from "axios";

const api = axios.create({
  baseURL: "https://back-end-for-assessment.vercel.app",
  headers: {
    "Content-Type": "application/json",
  },
});

// Add a request interceptor to inject the JWT token if available
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("access_token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

export default api;
