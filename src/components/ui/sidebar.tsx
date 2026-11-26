import * as React from "react";
import { useState, createContext, useContext } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Menu, X } from "lucide-react";
import { cn } from "../../lib/utils";

export interface SidebarLinkItem {
  label: string;
  href?: string;
  icon: React.ReactNode;
  onClick?: () => void;
  isActive?: boolean;
  badge?: string | number;
  badgeTone?: "amber" | "blue" | "emerald";
}

interface SidebarContextProps {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  animate: boolean;
}

const SidebarContext = createContext<SidebarContextProps | undefined>(undefined);

export const useSidebar = () => {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider");
  }
  return context;
};

export const SidebarProvider = ({
  children,
  open: openProp,
  setOpen: setOpenProp,
  animate = true,
}: {
  children: React.ReactNode;
  open?: boolean;
  setOpen?: React.Dispatch<React.SetStateAction<boolean>>;
  animate?: boolean;
}) => {
  const [openState, setOpenState] = useState(false);

  const open = openProp !== undefined ? openProp : openState;
  const setOpen = setOpenProp !== undefined ? setOpenProp : setOpenState;

  return (
    <SidebarContext.Provider value={{ open, setOpen, animate }}>
      {children}
    </SidebarContext.Provider>
  );
};

export const Sidebar = ({
  children,
  open,
  setOpen,
  animate = true,
}: {
  children: React.ReactNode;
  open?: boolean;
  setOpen?: React.Dispatch<React.SetStateAction<boolean>>;
  animate?: boolean;
}) => {
  return (
    <SidebarProvider open={open} setOpen={setOpen} animate={animate}>
      {children}
    </SidebarProvider>
  );
};

export const SidebarBody = ({
  hideMobileTrigger = false,
  mobileOpen,
  setMobileOpen,
  ...props
}: React.ComponentProps<typeof motion.div> & {
  hideMobileTrigger?: boolean;
  mobileOpen?: boolean;
  setMobileOpen?: (open: boolean) => void;
}) => {
  return (
    <>
      <DesktopSidebar {...props} />
      <MobileSidebar
        hideMobileTrigger={hideMobileTrigger}
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
        className={props.className}
      >
        {props.children as React.ReactNode}
      </MobileSidebar>
    </>
  );
};

export const DesktopSidebar = ({
  className,
  children,
  ...props
}: React.ComponentProps<typeof motion.div>) => {
  const { open, setOpen, animate } = useSidebar();
  return (
    <motion.aside
      className={cn(
        "sticky top-0 h-screen px-3 py-4 hidden lg:flex lg:flex-col bg-[#0c0c0f]/95 backdrop-blur-xl border-r border-white/[0.07] shadow-[inset_-1px_0_0_rgba(255,255,255,0.03)] w-[268px] shrink-0 z-40 select-none will-change-[width] [contain:layout_style]",
        className
      )}
      initial={false}
      animate={{
        width: animate ? (open ? 268 : 68) : 268,
      }}
      transition={{ type: "spring", stiffness: 420, damping: 36, mass: 0.78 }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      {...(props as any)}
    >
      {children}
    </motion.aside>
  );
};

export const MobileSidebar = ({
  className,
  children,
  hideMobileTrigger = false,
  mobileOpen,
  setMobileOpen,
  ...props
}: React.ComponentProps<"div"> & {
  hideMobileTrigger?: boolean;
  mobileOpen?: boolean;
  setMobileOpen?: (open: boolean) => void;
}) => {
  const { open, setOpen } = useSidebar();
  const isDrawerOpen = mobileOpen !== undefined ? mobileOpen : open;
  const setDrawerOpen = (val: boolean) => {
    if (setMobileOpen) setMobileOpen(val);
    else setOpen(val);
  };

  return (
    <>
      {!hideMobileTrigger && (
        <div
          className={cn(
            "h-12 px-4 py-3 flex flex-row lg:hidden items-center justify-between bg-[#0c0c0f] border-b border-white/[0.07] w-full"
          )}
          {...props}
        >
          <div className="flex justify-end z-20 w-full">
            <button
              type="button"
              onClick={() => setDrawerOpen(!isDrawerOpen)}
              className="text-zinc-200 cursor-pointer p-1.5 rounded-lg hover:bg-white/[0.06]"
              aria-label="Abrir menu"
            >
              <Menu className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      <AnimatePresence>
        {isDrawerOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setDrawerOpen(false)}
              className="fixed inset-0 bg-black/75 backdrop-blur-sm z-[90] lg:hidden"
            />
            <motion.div
              initial={{ x: "-100%", opacity: 0.6 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: "-100%", opacity: 0.6 }}
              transition={{
                type: "spring",
                stiffness: 390,
                damping: 36,
                mass: 0.85,
              }}
              className={cn(
                "fixed inset-y-0 left-0 w-[85vw] max-w-[312px] bg-[#0c0c0f]/98 backdrop-blur-2xl border-r border-white/[0.1] p-5 z-[100] flex flex-col justify-between lg:hidden overflow-y-auto no-scrollbar shadow-2xl",
                className
              )}
            >
              <button
                type="button"
                className="absolute right-4 top-4 z-50 text-zinc-400 hover:text-white p-1.5 rounded-lg hover:bg-white/[0.08] cursor-pointer transition-colors"
                onClick={() => setDrawerOpen(false)}
                aria-label="Fechar menu"
              >
                <X className="w-5 h-5" />
              </button>
              {children}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};

export const SidebarLink = ({
  link,
  className,
}: {
  link: SidebarLinkItem;
  className?: string;
}) => {
  const { open, animate } = useSidebar();
  const badgeClasses =
    link.badgeTone === "blue"
      ? "bg-sky-500/15 text-sky-300 border-sky-500/25"
      : link.badgeTone === "emerald"
        ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/25"
        : "bg-amber-500/15 text-amber-300 border-amber-500/25";

  return (
    <button
      type="button"
      onClick={link.onClick}
      title={!open ? link.label : undefined}
      className={cn(
        "relative w-full flex items-center justify-between gap-2.5 px-2.5 py-2 rounded-xl group/sidebar transition-colors duration-150 cursor-pointer text-left overflow-hidden",
        link.isActive
          ? "text-white font-semibold"
          : "text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.045]",
        className
      )}
    >
      {link.isActive && (
        <motion.div
          layoutId="activeSidebarTabPill"
          className="absolute inset-0 bg-gradient-to-r from-emerald-500/[0.18] via-emerald-500/[0.08] to-transparent border border-emerald-500/25 rounded-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
          transition={{ type: "spring", stiffness: 520, damping: 38 }}
        >
          <span className="absolute left-0 top-2 bottom-2 w-[2.5px] rounded-r-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.7)]" />
        </motion.div>
      )}

      <div className="flex items-center gap-3 min-w-0 z-10">
        <span
          className={cn(
            "shrink-0 flex items-center justify-center transition-colors duration-150",
            link.isActive ? "text-emerald-400" : "text-zinc-400 group-hover/sidebar:text-zinc-200"
          )}
        >
          {link.icon}
        </span>
        <motion.span
          initial={false}
          animate={{
            opacity: animate ? (open ? 1 : 0) : 1,
            x: animate ? (open ? 0 : -6) : 0,
          }}
          transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
          className={cn(
            "text-xs font-medium group-hover/sidebar:translate-x-0.5 transition-transform duration-150 whitespace-nowrap truncate",
            !open && animate ? "pointer-events-none" : ""
          )}
        >
          {link.label}
        </motion.span>
      </div>

      {open && link.badge !== undefined && Number(link.badge) > 0 && (
        <span
          className={cn(
            "z-10 text-[10px] px-1.5 py-0.5 rounded-md font-mono tabular-nums font-semibold border shrink-0",
            badgeClasses
          )}
        >
          {link.badge}
        </span>
      )}
    </button>
  );
};
