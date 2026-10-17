"use client";

import { createContext, useContext, type ReactNode } from "react";

const NavigationCapabilities = createContext({ sharing: false });

/** Deployment availability only. Services continue to authorize every request. */
export function NavigationCapabilitiesProvider({
  sharing,
  children,
}: {
  sharing: boolean;
  children: ReactNode;
}) {
  return (
    <NavigationCapabilities.Provider value={{ sharing }}>
      {children}
    </NavigationCapabilities.Provider>
  );
}

export const useNavigationCapabilities = () =>
  useContext(NavigationCapabilities);
