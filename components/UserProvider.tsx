"use client";

import { Profile, AppUser } from "@/types";
import { createContext, useContext, ReactNode } from "react";

interface UserState {
  user: AppUser | null;
  profile: Profile | null;
  isAdmin: boolean;
  isEditor: boolean;
}

const UserContext = createContext<UserState | undefined>(undefined);

export function UserProvider({
  children,
  user,
  profile,
}: {
  children: ReactNode;
  user: AppUser | null;
  profile: Profile | null;
}) {
  const isAdmin = profile?.role === "admin";
  const isEditor = profile?.role === "editor" || isAdmin;

  return (
    <UserContext.Provider value={{ user, profile, isAdmin, isEditor }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return context;
}
