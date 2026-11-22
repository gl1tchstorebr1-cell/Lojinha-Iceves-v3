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
        "sticky top-0 h-screen px-3 py-4 hidden lg:flex lg:flex-col bg-[#141416] border-r border-white/[0.08] w-[272px] shrink-0 z-40 select-none",
        className
      )}
      initial={false}
      animate={{
        width: animate ? (open ? 268 : 68) : 268,
      }}
      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
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
            "h-12 px-4 py-3 flex flex-row lg:hidden items-center justify-between bg-[#141416] border-b border-white/[0.08] w-full"
          )}
          {...props}
        >
          <div className="flex justify-end z-20 w-full">
            <button
              type="button"
              onClick={() => setDrawerOpen(!isDrawerOpen)}
              className="text-zinc-200 cursor-pointer p-1"
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
              onClick={() => setDrawerOpen(false)}
              className="fixed inset-0 bg-black/70 backdrop-blur-xs z-[90] lg:hidden"
            />
            <motion.div
              initial={{ x: "-100%", opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: "-100%", opacity: 0 }}
              transition={{
                duration: 0.28,
                ease: "easeInOut",
              }}
              className={cn(
                "fixed inset-y-0 left-0 w-[85vw] max-w-[320px] bg-[#141416] border-r border-white/[0.1] p-5 z-[100] flex flex-col justify-between lg:hidden overflow-y-auto no-scrollbar",
                className
              )}
            >
              <button
                type="button"
                className="absolute right-4 top-4 z-50 text-zinc-300 hover:text-white p-1.5 rounded-lg hover:bg-white/[0.08] cursor-pointer"
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
      ? "bg-blue-500/15 text-blue-400 border-blue-500/25"
      : link.badgeTone === "emerald"
        ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/25"
        : "bg-amber-500/15 text-amber-400 border-amber-500/25";

  return (
    <button
      type="button"
      onClick={link.onClick}
      title={!open ? link.label : undefined}
      className={cn(
        "relative w-full flex items-center justify-between gap-2.5 px-2.5 py-2 rounded-xl group/sidebar transition-colors cursor-pointer text-left",
        link.isActive
          ? "text-white"
          : "text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.05]",
        className
      )}
    >
      {link.isActive && (
        <motion.div
          layoutId="activeSidebarTabPill"
          className="absolute inset-0 bg-gradient-to-r from-emerald-500/20 to-teal-600/10 border border-emerald-500/30 rounded-xl"
          transition={{ type: "spring", stiffness: 480, damping: 36 }}
        />
      )}

      <div className="flex items-center gap-3 min-w-0 z-10">
        <span className="shrink-0 flex items-center justify-center">{link.icon}</span>
        <motion.span
          initial={false}
          animate={{
            display: animate ? (open ? "inline-block" : "none") : "inline-block",
            opacity: animate ? (open ? 1 : 0) : 1,
          }}
          transition={{ duration: 0.16 }}
          className="text-xs font-medium group-hover/sidebar:translate-x-1 transition duration-150 whitespace-nowrap truncate"
        >
          {link.label}
        </motion.span>
      </div>

      {open && link.badge !== undefined && Number(link.badge) > 0 && (
        <span
          className={cn(
            "z-10 text-[10px] px-1.5 py-0.5 rounded-full font-mono border shrink-0",
            badgeClasses
          )}
        >
          {link.badge}
        </span>
      )}
    </button>
  );
};
