import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, Users, Building2, Briefcase, Clock, Shield, BookUser,
  CalendarCheck, CalendarDays, ClipboardList, Coffee, MessageSquare, Hash, Megaphone,
  TrendingUp, BarChart3, Tag,
  BookOpen, Sparkles,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/useAuth";

const main = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Directory", url: "/directory", icon: BookUser },
  { title: "Messages", url: "/chat", icon: MessageSquare },
  { title: "Channels", url: "/channels", icon: Hash },
  { title: "Announcements", url: "/announcements", icon: Megaphone },
  { title: "My Attendance", url: "/attendance", icon: CalendarCheck },
  { title: "Team Attendance", url: "/attendance/team", icon: ClipboardList },
  { title: "My Breaks", url: "/breaks", icon: Coffee },
  { title: "Team Breaks", url: "/breaks/team", icon: ClipboardList },
  { title: "My Sales", url: "/sales", icon: TrendingUp },
  { title: "Team Sales", url: "/sales/team", icon: ClipboardList },
  { title: "Analytics", url: "/analytics", icon: BarChart3 },
  { title: "Knowledge Base", url: "/knowledge", icon: BookOpen },
  { title: "JD AI", url: "/jdai", icon: Sparkles },
];

const admin = [
  { title: "Employees", url: "/admin/employees", icon: Users },
  { title: "Departments", url: "/admin/departments", icon: Briefcase },
  { title: "Centres", url: "/admin/centres", icon: Building2 },
  { title: "Shifts", url: "/admin/shifts", icon: Clock },
  { title: "Holidays", url: "/admin/holidays", icon: CalendarDays },
  { title: "Break Management", url: "/admin/breaks", icon: Coffee },
  { title: "Sales Sources", url: "/admin/sales-sources", icon: Tag },
  { title: "Knowledge Admin", url: "/admin/knowledge", icon: BookOpen },
  { title: "Roles & Permissions", url: "/admin/roles", icon: Shield },
];

export function AppSidebar() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { isAdmin } = useAuth();
  const isActive = (u: string) => path === u || path.startsWith(u + "/");

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
              {main.map((item) => (
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

        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel>Administration</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {admin.map((item) => (
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