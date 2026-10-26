"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";

import api from "../lib/api";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const token =
          localStorage.getItem("token");

        if (!token) {
          setLoading(false);
          return;
        }

        const response =
          await api.get("/auth/profile");

        if (response.data.success) {
          setUser(response.data.user);

          localStorage.setItem(
            "user",
            JSON.stringify(
              response.data.user
            )
          );
        }
      } catch (error) {
        console.error(
          "Load user error:",
          error
        );

        localStorage.removeItem("token");
        localStorage.removeItem("user");

        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    loadUser();
  }, []);

  const login = async (
    email,
    password
  ) => {
    const response = await api.post(
      "/auth/login",
      {
        email,
        password,
      }
    );

    if (response.data.success) {
      localStorage.setItem(
        "token",
        response.data.token
      );

      localStorage.setItem(
        "user",
        JSON.stringify(
          response.data.user
        )
      );

      setUser(response.data.user);
    }

    return response.data;
  };

  const signup = async (
    name,
    email,
    password
  ) => {
    const response = await api.post(
      "/auth/signup",
      {
        name,
        email,
        password,
      }
    );

    if (response.data.success) {
      localStorage.setItem(
        "token",
        response.data.token
      );

      localStorage.setItem(
        "user",
        JSON.stringify(
          response.data.user
        )
      );

      setUser(response.data.user);
    }

    return response.data;
  };

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");

    setUser(null);

    window.location.href = "/login";
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        signup,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  return useContext(AuthContext);
};