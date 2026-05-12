import { Link, useLocation } from "react-router-dom";
import { Home, Shield, LayoutDashboard, Tag as TagIcon, Users, BarChart3, Music as MusicIcon } from "lucide-react";
import logo from "@/assets/logo.png";
import { useAuth } from "@/contexts/AuthContext";

export const Sidebar = () => {
  const { pathname } = useLocation();
  const { isAdmin } = useAuth();

  const NavItem = ({ to, icon: Icon, label }: { to: string; icon: typeof Home; label: string }) => {
    const active = pathname === to;
    return (
      <Link to={to} className={`flex items-center gap-4 text-sm font-medium transition-colors ${active ? "text-foreground" : "text-muted-foreground hover:text-silver"}`}>
        <Icon className={`h-4 w-4 ${active ? "text-primary" : ""}`} />
        <span>{label}</span>
      </Link>
    );
  };

  return (
    <aside className="hidden md:flex w-60 bg-card border-r border-border flex-col shrink-0 py-8 px-6">
      <Link to="/" className="flex items-center gap-2.5 mb-12 hover:opacity-80 transition-opacity">
        <img src={logo} alt="" className="h-7 w-7" />
        <span className="text-base font-display tracking-tight text-primary">mySunshine</span>
      </Link>
      <nav className="flex flex-col gap-5">
        <NavItem to="/" icon={Home} label="Home" />
        {isAdmin && (
          <>
            <NavItem to="/admin" icon={Shield} label="Admin" />
            <div className="ml-7 flex flex-col gap-3 border-l border-border pl-3 -mt-2">
              <NavItem to="/admin" icon={LayoutDashboard} label="Dashboard" />
              <NavItem to="/admin/songs" icon={MusicIcon} label="Songs" />
              <NavItem to="/admin/tags" icon={TagIcon} label="Tags" />
              <NavItem to="/admin/users" icon={Users} label="Users" />
              <NavItem to="/admin/analytics" icon={BarChart3} label="Analytics" />
            </div>
          </>
        )}
      </nav>
    </aside>
  );
};
