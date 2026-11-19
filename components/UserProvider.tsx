"use client";

import { Profile, AppUser, TreeRole } from "@/types";
import { createContext, useContext, ReactNode } from "react";

interface UserState {
  treeRole?: TreeRole;
  user: AppUser | null;
  profile: Profile | null;
}

const UserContext = createContext<UserState | undefined>(undefined);

export function UserProvider({
  treeRole,
  children,
  user,
  profile,
}: {
  treeRole?: TreeRole;
  children: ReactNode;
  user: AppUser | null;
  profile: Profile | null;
}) {
  return (
    <UserContext.Provider value={{ treeRole, user, profile }}>
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
