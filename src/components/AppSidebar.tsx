import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, Users, Building2, Briefcase, Clock, Shield, BookUser, Activity, Search,
  CalendarCheck, CalendarDays, ClipboardList, Coffee, MessagesSquare,
  TrendingUp, BarChart3, Tag,
  BookOpen, Sparkles,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { useCommUnread } from "@/components/useCommUnread";
import { usePermissions } from "@/hooks/usePermissions";

const main = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Directory", url: "/directory", icon: BookUser, perm: "employees.view" },
  { title: "Search", url: "/search", icon: Search },
  { title: "Communication", url: "/communication", icon: MessagesSquare },
  { title: "Command Center", url: "/command-center", icon: Activity, perm: ["attendance.view_team", "sales.view_team"] },
  { title: "My Attendance", url: "/attendance", icon: CalendarCheck },
  { title: "Team Attendance", url: "/attendance/team", icon: ClipboardList, perm: "attendance.view_team" },
  { title: "My Breaks", url: "/breaks", icon: Coffee },
  { title: "Team Breaks", url: "/breaks/team", icon: ClipboardList, perm: "breaks.view_team" },
  { title: "My Sales", url: "/sales", icon: TrendingUp },
  { title: "Team Sales", url: "/sales/team", icon: ClipboardList, perm: "sales.view_team" },
  { title: "Analytics", url: "/analytics", icon: BarChart3, perm: "reports.dashboards" },
  { title: "Knowledge Base", url: "/knowledge", icon: BookOpen, perm: "documents.view" },
  { title: "JD AI", url: "/jdai", icon: Sparkles, perm: "reports.ai_analytics" },
];

const admin = [
  { title: "Employees", url: "/admin/employees", icon: Users, perm: "employees.view" },
  { title: "Departments", url: "/admin/departments", icon: Briefcase, perm: "admin.departments" },
  { title: "Centres", url: "/admin/centres", icon: Building2, perm: "admin.centres" },
  { title: "Shifts", url: "/admin/shifts", icon: Clock, perm: "admin.shifts" },
  { title: "Holidays", url: "/admin/holidays", icon: CalendarDays, perm: "admin.holidays" },
  { title: "Break Management", url: "/admin/breaks", icon: Coffee, perm: "breaks.policies_manage" },
  { title: "Sales Sources", url: "/admin/sales-sources", icon: Tag, perm: "admin.sales_sources" },
  { title: "Knowledge Admin", url: "/admin/knowledge", icon: BookOpen, perm: "admin.knowledge" },
  { title: "Roles & Permissions", url: "/admin/roles", icon: Shield, perm: "admin.roles" },
];

export function AppSidebar() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { isAdmin } = useAuth();
  // Active = exact match OR a prefix match where no other sidebar URL is a longer/more-specific match.
  const allUrls = [...main.map((i) => i.url), ...admin.map((i) => i.url)];
  const isActive = (u: string) => {
    if (path === u) return true;
    if (!path.startsWith(u + "/")) return false;
    return !allUrls.some((other) => other !== u && other.length > u.length && (path === other || path.startsWith(other + "/")));
  };
  const unread = useCommUnread();
  const { can, isLoading: permsLoading } = usePermissions();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-2 px-2 py-3">
          <div className="h-8 w-8 rounded-md bg-sidebar-primary text-sidebar-primary-foreground grid place-items-center font-bold">JD</div>
          <div className="flex flex-col leading-tight group-data-[collapsible=icon]:hidden">
            <span className="text-sm font-semibold text-sidebar-foreground">JD Connect</span>
            <span className="text-xs text-sidebar-foreground/60">Employee Portal</span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Main</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {main
                .filter((item) => {
                  const perm = (item as { perm?: string | string[] }).perm;
                  if (!perm) return true;
                  if (isAdmin) return true;
                  if (permsLoading) return false;
                  if (Array.isArray(perm)) {
                    return perm.some((p) => can(p));
                  }
                  return can(perm);
                })
                .map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
                    <Link to={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                      {item.url === "/communication" && unread.total > 0 && (
                        <Badge className="ml-auto h-5 min-w-5 justify-center px-1.5 text-[10px]">
                          {unread.total > 99 ? "99+" : unread.total}
                        </Badge>
                      )}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {(isAdmin || admin.some((i) => can(i.perm))) && (
          <SidebarGroup>
            <SidebarGroupLabel>Administration</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {admin
                  .filter((item) => isAdmin || can(item.perm))
                  .map((item) => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
                      <Link to={item.url}>
                        <item.icon />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
    </Sidebar>
  );
}