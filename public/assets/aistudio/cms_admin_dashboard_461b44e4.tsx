import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence, useSpring, useTransform } from 'framer-motion';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  BarChart, Bar, LineChart, Line
} from 'recharts';
import {
  Command, Plus, Mail, LayoutGrid, Users, DollarSign, BarChart3, CheckSquare,
  Lock, Folder, MoreVertical, Search, Settings, Sun, Moon, PanelLeftClose,
  PanelLeft, ArrowUpRight, ArrowDownRight, Filter, Calendar, CreditCard,
  ArrowUpDown, Download, Check, ChevronRight, X, UserCheck, ShieldCheck,
  TrendingUp, Sparkles, ExternalLink, HelpCircle
} from 'lucide-react';

// ==========================================
// MOCK DATA GENERATION
// ==========================================

const generateActivityData = (daysCount = 90) => {
  const data = [];
  const startDate = new Date(2026, 0, 29); // Jan 29
  
  for (let i = 0; i < daysCount; i++) {
    const currentDate = new Date(startDate);
    currentDate.setDate(startDate.getDate() + i);
    
    // Create spikey data matching reference image
    const isSpike = Math.random() < 0.12;
    const spikeMultiplier = isSpike ? (2.5 + Math.random() * 3) : 1;
    
    const activeAccounts = Math.floor((120 + Math.random() * 80) * spikeMultiplier);
    const newCustomers = Math.floor((30 + Math.random() * 25) * (isSpike ? 1.8 : 1));
    const returningUsers = Math.floor((80 + Math.random() * 40) * (isSpike ? 1.4 : 1));

    const dateStr = currentDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    
    data.push({
      date: dateStr,
      fullDate: currentDate.toISOString().split('T')[0],
      activeAccounts,
      newCustomers,
      returningUsers,
    });
  }
  return data;
};

const initialCustomers = [
  { id: '1', name: 'Olivia Martin', email: 'olivia.martin@email.com', avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150', plan: 'Enterprise', billing: 'Annual ($2,400)', status: 'Active', joined: 'Jan 15, 2026' },
  { id: '2', name: 'Jackson Lee', email: 'jackson.lee@email.com', avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150', plan: 'Pro', billing: 'Monthly ($49)', status: 'Active', joined: 'Jan 22, 2026' },
  { id: '3', name: 'Isabella Nguyen', email: 'isabella.nguyen@email.com', avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150', plan: 'Starter', billing: 'Monthly ($19)', status: 'Pending', joined: 'Feb 03, 2026' },
  { id: '4', name: 'William Kim', email: 'william.kim@email.com', avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150', plan: 'Enterprise', billing: 'Annual ($2,400)', status: 'Active', joined: 'Feb 10, 2026' },
  { id: '5', name: 'Sofia Davis', email: 'sofia.davis@email.com', avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150', plan: 'Pro', billing: 'Annual ($490)', status: 'Active', joined: 'Feb 18, 2026' },
  { id: '6', name: 'Liam Wilson', email: 'liam.wilson@email.com', avatar: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=150', plan: 'Starter', billing: 'Monthly ($19)', status: 'Inactive', joined: 'Mar 01, 2026' },
  { id: '7', name: 'Ava Brown', email: 'ava.brown@email.com', avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150', plan: 'Enterprise', billing: 'Annual ($3,600)', status: 'Active', joined: 'Mar 12, 2026' },
  { id: '8', name: 'Lucas Chen', email: 'lucas.chen@email.com', avatar: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=150', plan: 'Pro', billing: 'Monthly ($49)', status: 'Active', joined: 'Mar 24, 2026' },
  { id: '9', name: 'Emma Garcia', email: 'emma.garcia@email.com', avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150', plan: 'Starter', billing: 'Monthly ($19)', status: 'Pending', joined: 'Apr 05, 2026' },
  { id: '10', name: 'Noah Patel', email: 'noah.patel@email.com', avatar: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150', plan: 'Enterprise', billing: 'Annual ($2,400)', status: 'Active', joined: 'Apr 18, 2026' },
];

// ==========================================
// ANIMATED COUNTER COMPONENT
// ==========================================

const AnimatedCounter = ({ value, prefix = '', suffix = '', decimals = 0 }) => {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    let start = 0;
    const end = parseFloat(value.toString().replace(/[^0-9.-]+/g, ''));
    const duration = 1200; // ms
    const startTime = performance.now();

    const updateCount = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // EaseOutQuad
      const easeProgress = 1 - (1 - progress) * (1 - progress);
      const current = start + (end - start) * easeProgress;
      
      setDisplayValue(current);

      if (progress < 1) {
        requestAnimationFrame(updateCount);
      }
    };

    requestAnimationFrame(updateCount);
  }, [value]);

  const formatted = displayValue.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return <span>{prefix}{formatted}{suffix}</span>;
};

// ==========================================
// SPOTLIGHT CARD COMPONENT (Cursor Glow Effect)
// ==========================================

const SpotlightCard = ({ children, className = '', onClick }) => {
  const cardRef = useRef(null);
  const [mousePos, setMousePos] = useState({ x: -200, y: -200 });
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseMove = (e) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    setMousePos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  return (
    <motion.div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onClick}
      whileHover={{ y: -2 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      className={`relative overflow-hidden rounded-xl bg-[#111111] border border-white/[0.08] p-5 shadow-sm transition-colors hover:border-white/[0.18] ${className}`}
    >
      {/* Spotlight overlay */}
      <div
        className="pointer-events-none absolute -inset-px transition-opacity duration-300"
        style={{
          opacity: isHovered ? 1 : 0,
          background: `radial-gradient(600px circle at ${mousePos.x}px ${mousePos.y}px, rgba(255, 255, 255, 0.06), transparent 40%)`,
        }}
      />
      <div className="relative z-10">{children}</div>
    </motion.div>
  );
};

// ==========================================
// COMMAND PALETTE MODAL
// ==========================================

const CommandPalette = ({ isOpen, onClose, onSelectTab }) => {
  const [query, setQuery] = useState('');

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (isOpen) onClose();
        else onClose(true); // Toggle logic handled outside
      }
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const items = [
    { name: 'Default Dashboard', icon: LayoutGrid, section: 'Navigation', action: () => onSelectTab('Default') },
    { name: 'CRM Dashboard', icon: Users, section: 'Navigation', action: () => onSelectTab('CRM') },
    { name: 'Finance Overview', icon: DollarSign, section: 'Navigation', action: () => onSelectTab('Finance') },
    { name: 'Analytics Detailed', icon: BarChart3, section: 'Navigation', action: () => onSelectTab('Analytics') },
    { name: 'Productivity Tracker', icon: CheckSquare, section: 'Navigation', action: () => onSelectTab('Productivity') },
    { name: 'Export Customer List', icon: Download, section: 'Actions', action: () => alert('Exporting data...') },
    { name: 'System Settings', icon: Settings, section: 'Quick Links', action: () => alert('Settings opened') },
  ].filter(i => i.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        />

        {/* Modal Box */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: -10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -10 }}
          transition={{ duration: 0.15 }}
          className="relative w-full max-w-xl rounded-xl bg-[#141414] border border-white/[0.12] shadow-2xl overflow-hidden z-10"
        >
          <div className="flex items-center border-b border-white/[0.08] px-4 py-3">
            <Search className="w-4 h-4 text-zinc-400 mr-3 shrink-0" />
            <input
              type="text"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type a command or search..."
              className="w-full bg-transparent text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none"
            />
            <button onClick={onClose} className="p-1 text-zinc-400 hover:text-white rounded">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="max-h-80 overflow-y-auto p-2">
            {items.length === 0 ? (
              <p className="p-4 text-xs text-zinc-500 text-center">No results found.</p>
            ) : (
              items.map((item, index) => {
                const Icon = item.icon;
                return (
                  <button
                    key={index}
                    onClick={() => {
                      item.action();
                      onClose();
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs text-zinc-300 hover:bg-white/[0.06] hover:text-white transition-colors text-left"
                  >
                    <Icon className="w-4 h-4 text-zinc-400" />
                    <span className="flex-1">{item.name}</span>
                    <span className="text-[10px] text-zinc-500 uppercase tracking-wider">{item.section}</span>
                  </button>
                );
              })
            )}
          </div>
          <div className="border-t border-white/[0.08] px-4 py-2 flex items-center justify-between text-[11px] text-zinc-500 bg-[#111]">
            <span>Navigate with keyboard</span>
            <span>ESC to close</span>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

// ==========================================
// MAIN APP COMPONENT
// ==========================================

export default function App() {
  const [theme, setTheme] = useState('dark');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState('Default');
  const [authExpanded, setAuthExpanded] = useState(false);
  const [legacyExpanded, setLegacyExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [cmdOpen, setCmdOpen] = useState(false);

  // Time range filter for chart
  const [timeRange, setTimeRange] = useState('3 months');
  // Dynamic Chart Series Visibility
  const [visibleSeries, setVisibleSeries] = useState({
    activeAccounts: true,
    newCustomers: true,
    returningUsers: true,
  });

  // Customer Table state
  const [customers, setCustomers] = useState(initialCustomers);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [sortAsc, setSortAsc] = useState(true);

  // Simulate Skeleton Loading
  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 800);
    return () => clearTimeout(timer);
  }, []);

  // Filtered & Sorted Customer List
  const filteredCustomers = useMemo(() => {
    return customers
      .filter((item) => {
        const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                              item.email.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesStatus = statusFilter === 'All' || item.status === statusFilter;
        return matchesSearch && matchesStatus;
      })
      .sort((a, b) => {
        if (sortAsc) return a.name.localeCompare(b.name);
        return b.name.localeCompare(a.name);
      });
  }, [customers, searchQuery, statusFilter, sortAsc]);

  // Chart data based on range
  const chartData = useMemo(() => {
    const days = timeRange === '7 days' ? 7 : timeRange === '30 days' ? 30 : 90;
    return generateActivityData(days);
  }, [timeRange]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  const navItems = [
    { name: 'Default', icon: LayoutGrid },
    { name: 'CRM', icon: Users },
    { name: 'Finance', icon: DollarSign },
    { name: 'Analytics', icon: BarChart3 },
    { name: 'Productivity', icon: CheckSquare },
  ];

  return (
    <div className={`min-h-screen font-sans antialiased transition-colors duration-300 ${
      theme === 'dark' ? 'bg-[#0a0a0a] text-[#fafafa]' : 'bg-zinc-100 text-zinc-900'
    }`}>
      <div className="flex h-screen overflow-hidden">
        
        {/* ========================================== */}
        {/* SIDEBAR                                    */}
        {/* ========================================== */}
        <motion.aside
          animate={{ width: sidebarCollapsed ? 68 : 240 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className={`relative flex flex-col shrink-0 border-r border-white/[0.08] ${
            theme === 'dark' ? 'bg-[#111111]' : 'bg-white border-zinc-200'
          } z-20`}
        >
          {/* Header */}
          <div className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-2.5 overflow-hidden">
              <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-white text-black shrink-0 font-bold text-xs">
                <Command className="w-4 h-4" />
              </div>
              {!sidebarCollapsed && (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="font-semibold text-sm tracking-tight whitespace-nowrap"
                >
                  CMS Admin Dashboard
                </motion.span>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="px-3 py-2 flex items-center gap-2">
            <button className={`flex-1 flex items-center justify-center gap-2 bg-zinc-100 hover:bg-white text-black font-medium text-xs py-2 px-3 rounded-lg transition-all shadow-sm ${
              sidebarCollapsed ? 'p-2' : ''
            }`}>
              <Plus className="w-4 h-4 shrink-0" />
              {!sidebarCollapsed && <span>Quick Create</span>}
            </button>
            <button className={`flex items-center justify-center w-8 h-8 rounded-lg border border-white/[0.08] hover:bg-white/[0.06] transition-colors shrink-0 ${
              theme === 'dark' ? 'text-zinc-300' : 'text-zinc-700'
            }`}>
              <Mail className="w-4 h-4" />
            </button>
          </div>

          {/* Navigation Links */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-6">
            {/* Dashboards Section */}
            <div>
              {!sidebarCollapsed && (
                <div className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider px-2 mb-2">
                  Dashboards
                </div>
              )}
              <nav className="space-y-1">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.name;
                  return (
                    <button
                      key={item.name}
                      onClick={() => setActiveTab(item.name)}
                      className={`relative w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-xs font-medium transition-colors ${
                        isActive
                          ? 'text-white'
                          : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]'
                      }`}
                    >
                      {/* Active Indicator Background */}
                      {isActive && (
                        <motion.div
                          layoutId="activeTabBadge"
                          className="absolute inset-0 bg-white/[0.08] rounded-lg"
                          transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                        />
                      )}
                      <Icon className="w-4 h-4 shrink-0 z-10" />
                      {!sidebarCollapsed && <span className="z-10">{item.name}</span>}
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* Pages Section */}
            <div>
              {!sidebarCollapsed && (
                <div className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider px-2 mb-2">
                  Pages
                </div>
              )}
              <div className="space-y-1">
                <button
                  onClick={() => setAuthExpanded(!authExpanded)}
                  className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04] transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Lock className="w-4 h-4 shrink-0" />
                    {!sidebarCollapsed && <span>Authentication</span>}
                  </div>
                  {!sidebarCollapsed && (
                    <motion.div animate={{ rotate: authExpanded ? 90 : 0 }}>
                      <ChevronRight className="w-3.5 h-3.5 text-zinc-500" />
                    </motion.div>
                  )}
                </button>

                <AnimatePresence>
                  {authExpanded && !sidebarCollapsed && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="pl-9 space-y-1 overflow-hidden text-xs text-zinc-500"
                    >
                      <a href="#" className="block py-1.5 hover:text-zinc-300">Sign In</a>
                      <a href="#" className="block py-1.5 hover:text-zinc-300">Sign Up</a>
                      <a href="#" className="block py-1.5 hover:text-zinc-300">Reset Password</a>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Legacy Section */}
            <div>
              {!sidebarCollapsed && (
                <div className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider px-2 mb-2">
                  Legacy
                </div>
              )}
              <div className="space-y-1">
                <button
                  onClick={() => setLegacyExpanded(!legacyExpanded)}
                  className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04] transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Folder className="w-4 h-4 shrink-0" />
                    {!sidebarCollapsed && <span>Dashboards</span>}
                  </div>
                  {!sidebarCollapsed && (
                    <motion.div animate={{ rotate: legacyExpanded ? 90 : 0 }}>
                      <ChevronRight className="w-3.5 h-3.5 text-zinc-500" />
                    </motion.div>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Footer Card & Profile */}
          {!sidebarCollapsed && (
            <div className="p-3 border-t border-white/[0.08] space-y-3">
              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] text-xs space-y-1">
                <div className="font-semibold text-zinc-200">Looking for something more?</div>
                <div className="text-zinc-500 leading-relaxed text-[11px]">
                  Open an issue or do reach out to me.
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-2.5">
                  <img
                    src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100"
                    alt="User Avatar"
                    className="w-8 h-8 rounded-full object-cover border border-white/20"
                  />
                  <div className="text-left">
                    <div className="text-xs font-semibold text-zinc-200">Arnob Gomasta</div>
                    <div className="text-[10px] text-zinc-500">hello@arnob.com</div>
                  </div>
                </div>
                <button className="text-zinc-500 hover:text-zinc-300 p-1">
                  <MoreVertical className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </motion.aside>

        {/* ========================================== */}
        {/* MAIN CONTENT AREA                          */}
        {/* ========================================== */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          
          {/* TOPBAR */}
          <header className={`h-14 border-b border-white/[0.08] flex items-center justify-between px-4 shrink-0 ${
            theme === 'dark' ? 'bg-[#0a0a0a]' : 'bg-white border-zinc-200'
          }`}>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                className="p-1.5 rounded-lg border border-white/[0.08] text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors"
                aria-label="Toggle Sidebar"
              >
                {sidebarCollapsed ? <PanelLeft className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
              </button>

              {/* Search Bar */}
              <button
                onClick={() => setCmdOpen(true)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-xs text-zinc-400 hover:border-white/[0.16] transition-all w-48 sm:w-64 justify-between"
              >
                <div className="flex items-center gap-2">
                  <Search className="w-3.5 h-3.5" />
                  <span>Search</span>
                </div>
                <kbd className="px-1.5 py-0.5 rounded bg-white/[0.08] text-[10px] text-zinc-400 font-mono">⌘K</kbd>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button className="p-2 rounded-lg border border-white/[0.08] text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors">
                <Settings className="w-4 h-4" />
              </button>
              <button
                onClick={toggleTheme}
                className="p-2 rounded-lg border border-white/[0.08] text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors"
              >
                {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>
              <img
                src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100"
                alt="Profile"
                className="w-7 h-7 rounded-full object-cover ml-1 border border-white/20"
              />
            </div>
          </header>

          {/* DYNAMIC TAB CONTENT AREA */}
          <main className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.2 }}
                className="space-y-6 max-w-[1600px] mx-auto"
              >
                {activeTab === 'Default' && (
                  <>
                    {/* ========================================== */}
                    {/* 1. METRICS CARDS GRID                      */}
                    {/* ========================================== */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      {loading ? (
                        Array(4).fill(0).map((_, i) => (
                          <div key={i} className="h-32 rounded-xl bg-white/[0.03] animate-pulse border border-white/[0.08]" />
                        ))
                      ) : (
                        <>
                          {/* Card 1 */}
                          <SpotlightCard>
                            <div className="flex items-center justify-between mb-2">
                              <DollarSign className="w-4 h-4 text-zinc-400" />
                              <span className="text-zinc-400 text-xs font-medium">Total Revenue</span>
                            </div>
                            <div className="flex items-baseline justify-between mt-3">
                              <div className="text-3xl font-semibold tracking-tight">
                                <AnimatedCounter value={1250.00} prefix="$" decimals={2} />
                              </div>
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                                <TrendingUp className="w-3 h-3" /> +12.5%
                              </span>
                            </div>
                            <p className="text-[11px] text-zinc-500 mt-2">Visitors for the last 6 months</p>
                          </SpotlightCard>

                          {/* Card 2 */}
                          <SpotlightCard>
                            <div className="flex items-center justify-between mb-2">
                              <Users className="w-4 h-4 text-zinc-400" />
                              <span className="text-zinc-400 text-xs font-medium">New Customers</span>
                            </div>
                            <div className="flex items-baseline justify-between mt-3">
                              <div className="text-3xl font-semibold tracking-tight">
                                <AnimatedCounter value={1234} />
                              </div>
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full border border-red-500/20">
                                <ArrowDownRight className="w-3 h-3" /> -20%
                              </span>
                            </div>
                            <p className="text-[11px] text-zinc-500 mt-2">Acquisition needs attention</p>
                          </SpotlightCard>

                          {/* Card 3 */}
                          <SpotlightCard>
                            <div className="flex items-center justify-between mb-2">
                              <UserCheck className="w-4 h-4 text-zinc-400" />
                              <span className="text-zinc-400 text-xs font-medium">Active Accounts</span>
                            </div>
                            <div className="flex items-baseline justify-between mt-3">
                              <div className="text-3xl font-semibold tracking-tight">
                                <AnimatedCounter value={45678} />
                              </div>
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                                <TrendingUp className="w-3 h-3" /> +12.5%
                              </span>
                            </div>
                            <p className="text-[11px] text-zinc-500 mt-2">Engagement exceeds targets</p>
                          </SpotlightCard>

                          {/* Card 4 */}
                          <SpotlightCard>
                            <div className="flex items-center justify-between mb-2">
                              <BarChart3 className="w-4 h-4 text-zinc-400" />
                              <span className="text-zinc-400 text-xs font-medium">Growth Rate</span>
                            </div>
                            <div className="flex items-baseline justify-between mt-3">
                              <div className="text-3xl font-semibold tracking-tight">
                                <AnimatedCounter value={4.5} suffix="%" decimals={1} />
                              </div>
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                                <TrendingUp className="w-3 h-3" /> +4.5%
                              </span>
                            </div>
                            <p className="text-[11px] text-zinc-500 mt-2">Meets growth projections</p>
                          </SpotlightCard>
                        </>
                      )}
                    </div>

                    {/* ========================================== */}
                    {/* 2. CUSTOMER ACTIVITY CHART                 */}
                    {/* ========================================== */}
                    <div className="rounded-xl bg-[#111111] border border-white/[0.08] p-5">
                      {/* Header controls */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                        <div>
                          <h2 className="text-base font-semibold tracking-tight text-white">Customer Activity</h2>
                          <p className="text-xs text-zinc-400">Customer activity for the last 3 months</p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          {/* Time range selector */}
                          <select
                            value={timeRange}
                            onChange={(e) => setTimeRange(e.target.value)}
                            className="bg-[#18181b] border border-white/[0.1] rounded-lg px-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-400 cursor-pointer"
                          >
                            <option value="7 days">7 days</option>
                            <option value="30 days">30 days</option>
                            <option value="3 months">3 months</option>
                          </select>

                          {/* Segment Selector */}
                          <select className="bg-[#18181b] border border-white/[0.1] rounded-lg px-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-400 cursor-pointer">
                            <option>All segments</option>
                            <option>Enterprise</option>
                            <option>Pro</option>
                          </select>

                          <button className="bg-white text-black hover:bg-zinc-200 font-medium text-xs px-3 py-1.5 rounded-lg transition-colors">
                            View report
                          </button>
                        </div>
                      </div>

                      {/* Interactive Legend Items */}
                      <div className="flex items-center justify-end gap-6 mb-4 text-xs">
                        <button
                          onClick={() => setVisibleSeries(prev => ({ ...prev, activeAccounts: !prev.activeAccounts }))}
                          className={`flex items-center gap-2 transition-opacity ${visibleSeries.activeAccounts ? 'opacity-100' : 'opacity-40'}`}
                        >
                          <span className="w-2.5 h-2.5 rounded-sm bg-white" />
                          <span className="text-zinc-300">Active Accounts</span>
                        </button>
                        <button
                          onClick={() => setVisibleSeries(prev => ({ ...prev, newCustomers: !prev.newCustomers }))}
                          className={`flex items-center gap-2 transition-opacity ${visibleSeries.newCustomers ? 'opacity-100' : 'opacity-40'}`}
                        >
                          <span className="w-2.5 h-2.5 rounded-sm bg-zinc-500" />
                          <span className="text-zinc-300">New Customers</span>
                        </button>
                        <button
                          onClick={() => setVisibleSeries(prev => ({ ...prev, returningUsers: !prev.returningUsers }))}
                          className={`flex items-center gap-2 transition-opacity ${visibleSeries.returningUsers ? 'opacity-100' : 'opacity-40'}`}
                        >
                          <span className="w-2.5 h-2.5 rounded-sm bg-zinc-700" />
                          <span className="text-zinc-300">Returning Users</span>
                        </button>
                      </div>

                      {/* Area Chart */}
                      <div className="h-72 w-full">
                        {loading ? (
                          <div className="h-full w-full bg-white/[0.02] animate-pulse rounded-lg" />
                        ) : (
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                              <defs>
                                <linearGradient id="gradWhite" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor="#ffffff" stopOpacity={0.25} />
                                  <stop offset="95%" stopColor="#ffffff" stopOpacity={0.0} />
                                </linearGradient>
                                <linearGradient id="gradGray" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor="#a1a1aa" stopOpacity={0.15} />
                                  <stop offset="95%" stopColor="#a1a1aa" stopOpacity={0.0} />
                                </linearGradient>
                                <linearGradient id="gradDark" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor="#52525b" stopOpacity={0.1} />
                                  <stop offset="95%" stopColor="#52525b" stopOpacity={0.0} />
                                </linearGradient>
                              </defs>
                              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                              <XAxis
                                dataKey="date"
                                stroke="#71717a"
                                fontSize={10}
                                tickLine={false}
                                axisLine={false}
                              />
                              <YAxis hide />
                              <Tooltip
                                content={({ active, payload, label }) => {
                                  if (active && payload && payload.length) {
                                    return (
                                      <div className="rounded-lg bg-[#18181b] border border-white/[0.12] p-3 shadow-xl text-xs space-y-1">
                                        <div className="text-zinc-400 font-medium mb-1">{label}</div>
                                        {payload.map((entry, index) => (
                                          <div key={index} className="flex items-center justify-between gap-4">
                                            <span style={{ color: entry.color }}>{entry.name}:</span>
                                            <span className="font-semibold text-white">{entry.value}</span>
                                          </div>
                                        ))}
                                      </div>
                                    );
                                  }
                                  return null;
                                }}
                              />
                              {visibleSeries.returningUsers && (
                                <Area
                                  type="monotone"
                                  dataKey="returningUsers"
                                  name="Returning Users"
                                  stroke="#52525b"
                                  strokeWidth={1.5}
                                  fillOpacity={1}
                                  fill="url(#gradDark)"
                                />
                              )}
                              {visibleSeries.newCustomers && (
                                <Area
                                  type="monotone"
                                  dataKey="newCustomers"
                                  name="New Customers"
                                  stroke="#a1a1aa"
                                  strokeWidth={1.5}
                                  fillOpacity={1}
                                  fill="url(#gradGray)"
                                />
                              )}
                              {visibleSeries.activeAccounts && (
                                <Area
                                  type="monotone"
                                  dataKey="activeAccounts"
                                  name="Active Accounts"
                                  stroke="#ffffff"
                                  strokeWidth={2}
                                  fillOpacity={1}
                                  fill="url(#gradWhite)"
                                />
                              )}
                            </AreaChart>
                          </ResponsiveContainer>
                        )}
                      </div>
                    </div>

                    {/* ========================================== */}
                    {/* 3. CUSTOMERS TABLE                         */}
                    {/* ========================================== */}
                    <div className="rounded-xl bg-[#111111] border border-white/[0.08] overflow-hidden">
                      {/* Table Header */}
                      <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.08]">
                        <div>
                          <h2 className="text-base font-semibold tracking-tight text-white">18,426 Customers</h2>
                          <p className="text-xs text-zinc-400">Recent customer records with plan, billing, status, and signup activity.</p>
                        </div>
                        <button className="self-start sm:self-auto flex items-center gap-2 bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.1] text-xs font-medium text-white px-3 py-1.5 rounded-lg transition-colors">
                          <Download className="w-3.5 h-3.5" />
                          <span>Export</span>
                        </button>
                      </div>

                      {/* Filters Toolbar */}
                      <div className="p-3 bg-white/[0.01] border-b border-white/[0.08] flex flex-wrap items-center justify-between gap-3 text-xs">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="relative">
                            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-zinc-500" />
                            <input
                              type="text"
                              placeholder="Search customers..."
                              value={searchQuery}
                              onChange={(e) => setSearchQuery(e.target.value)}
                              className="pl-8 pr-3 py-1.5 bg-[#18181b] border border-white/[0.1] rounded-lg text-xs text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-400 w-48 sm:w-64"
                            />
                          </div>

                          {/* Filter by Status */}
                          <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="bg-[#18181b] border border-white/[0.1] rounded-lg px-3 py-1.5 text-zinc-300 focus:outline-none focus:ring-1 focus:ring-zinc-400 cursor-pointer"
                          >
                            <option value="All">Status: All</option>
                            <option value="Active">Active</option>
                            <option value="Pending">Pending</option>
                            <option value="Inactive">Inactive</option>
                          </select>

                          <button className="flex items-center gap-1.5 bg-[#18181b] border border-white/[0.1] px-3 py-1.5 rounded-lg text-zinc-300 hover:bg-white/[0.04]">
                            <Calendar className="w-3.5 h-3.5" /> Joined date
                          </button>
                        </div>

                        <div className="flex items-center gap-2">
                          <button className="flex items-center gap-1.5 bg-[#18181b] border border-white/[0.1] px-3 py-1.5 rounded-lg text-zinc-300 hover:bg-white/[0.04]">
                            <CreditCard className="w-3.5 h-3.5" /> Billing
                          </button>
                          <button
                            onClick={() => setSortAsc(!sortAsc)}
                            className="flex items-center gap-1.5 bg-[#18181b] border border-white/[0.1] px-3 py-1.5 rounded-lg text-zinc-300 hover:bg-white/[0.04]"
                          >
                            <ArrowUpDown className="w-3.5 h-3.5" /> Sort
                          </button>
                        </div>
                      </div>

                      {/* Table Content */}
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-white/[0.02] border-b border-white/[0.08] text-zinc-400 font-medium">
                            <tr>
                              <th className="p-3.5 w-10 text-center">
                                <input type="checkbox" className="rounded border-zinc-700 bg-zinc-800" />
                              </th>
                              <th className="p-3.5">Customer</th>
                              <th className="p-3.5">Plan</th>
                              <th className="p-3.5">Billing</th>
                              <th className="p-3.5">Status</th>
                              <th className="p-3.5">Joined Date</th>
                              <th className="p-3.5 w-10"></th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/[0.06]">
                            <AnimatePresence>
                              {filteredCustomers.map((cust) => (
                                <motion.tr
                                  key={cust.id}
                                  layout
                                  initial={{ opacity: 0 }}
                                  animate={{ opacity: 1 }}
                                  exit={{ opacity: 0 }}
                                  className="hover:bg-white/[0.02] transition-colors group"
                                >
                                  <td className="p-3.5 text-center">
                                    <input type="checkbox" className="rounded border-zinc-700 bg-zinc-800" />
                                  </td>
                                  <td className="p-3.5">
                                    <div className="flex items-center gap-3">
                                      <img
                                        src={cust.avatar}
                                        alt={cust.name}
                                        className="w-8 h-8 rounded-full object-cover border border-white/10"
                                      />
                                      <div>
                                        <div className="font-semibold text-white group-hover:text-zinc-200">{cust.name}</div>
                                        <div className="text-[11px] text-zinc-500">{cust.email}</div>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="p-3.5">
                                    <span className="px-2 py-0.5 rounded-full border border-white/[0.1] bg-white/[0.04] text-zinc-300 font-medium">
                                      {cust.plan}
                                    </span>
                                  </td>
                                  <td className="p-3.5 text-zinc-300">{cust.billing}</td>
                                  <td className="p-3.5">
                                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium ${
                                      cust.status === 'Active'
                                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                        : cust.status === 'Pending'
                                        ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                        : 'bg-zinc-500/10 text-zinc-400 border border-zinc-500/20'
                                    }`}>
                                      {cust.status === 'Active' && (
                                        <span className="relative flex h-1.5 w-1.5">
                                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                                        </span>
                                      )}
                                      {cust.status}
                                    </span>
                                  </td>
                                  <td className="p-3.5 text-zinc-400">{cust.joined}</td>
                                  <td className="p-3.5 text-right">
                                    <button className="text-zinc-500 hover:text-white p-1">
                                      <MoreVertical className="w-4 h-4" />
                                    </button>
                                  </td>
                                </motion.tr>
                              ))}
                            </AnimatePresence>
                          </tbody>
                        </table>
                      </div>

                      {/* Pagination Footer */}
                      <div className="p-4 border-t border-white/[0.08] flex items-center justify-between text-xs text-zinc-400">
                        <div>Showing 1 to {filteredCustomers.length} of 18,426 entries</div>
                        <div className="flex items-center gap-2">
                          <button className="px-3 py-1 rounded bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] disabled:opacity-50">
                            Previous
                          </button>
                          <button className="px-3 py-1 rounded bg-white text-black font-medium hover:bg-zinc-200">
                            Next
                          </button>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {/* ========================================== */}
                {/* OTHER DASHBOARD PAGES                      */}
                {/* ========================================== */}
                {activeTab !== 'Default' && (
                  <div className="p-12 text-center rounded-xl bg-[#111] border border-white/[0.08] space-y-4">
                    <div className="inline-flex p-4 rounded-full bg-white/[0.04] border border-white/[0.08]">
                      <Sparkles className="w-8 h-8 text-zinc-300" />
                    </div>
                    <h2 className="text-2xl font-bold text-white">{activeTab} Dashboard</h2>
                    <p className="text-sm text-zinc-400 max-w-md mx-auto">
                      Detailed insights, secondary charts, and custom analytics view for {activeTab.toLowerCase()}.
                    </p>
                    <button
                      onClick={() => setActiveTab('Default')}
                      className="mt-4 bg-white text-black text-xs font-semibold px-4 py-2 rounded-lg hover:bg-zinc-200"
                    >
                      Return to Default
                    </button>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
      </div>

      {/* Command Palette Modal */}
      <CommandPalette
        isOpen={cmdOpen}
        onClose={(val) => setCmdOpen(typeof val === 'boolean' ? val : false)}
        onSelectTab={(tab) => setActiveTab(tab)}
      />
    </div>
  );
}