import { create } from "zustand";

type UiStore = {
  loginOpen: boolean;
  profileOpen: boolean;
  mobileMenuOpen: boolean;
  setLoginOpen: (open: boolean) => void;
  setProfileOpen: (open: boolean) => void;
  setMobileMenuOpen: (open: boolean) => void;
};

export const useUiStore = create<UiStore>((set) => ({
  loginOpen: false,
  profileOpen: false,
  mobileMenuOpen: false,
  setLoginOpen: (loginOpen) => set({ loginOpen }),
  setProfileOpen: (profileOpen) => set({ profileOpen }),
  setMobileMenuOpen: (mobileMenuOpen) => set({ mobileMenuOpen }),
}));
