import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Users,
  Building2,
  Briefcase,
  Clock,
  Shield,
  BookUser,
  Activity,
  Search,
  CalendarCheck,
  CalendarDays,
  ClipboardList,
  Coffee,
  MessagesSquare,
  TrendingUp,
  BarChart3,
  Tag,
  BookOpen,
  Sparkles,
  Globe,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { useCommUnread } from "@/components/useCommUnread";
import { usePermissions } from "@/hooks/usePermissions";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronRight, MessageSquare, Hash, Megaphone } from "lucide-react";

const main = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Directory", url: "/directory", icon: BookUser, perm: "employees.view" },
  { title: "Search", url: "/search", icon: Search },
  { title: "Communication", url: "/communication", icon: MessagesSquare },
  {
    title: "Command Center",
    url: "/command-center",
    icon: Activity,
    perm: ["attendance.view_team", "sales.view_team"],
  },
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
  { title: "IP Restrictions", url: "/admin/ip-restrictions", icon: Globe, perm: "admin.roles" },
];

export function AppSidebar() {
  const routerState = useRouterState();
  const path = routerState.location.pathname;
  const search = routerState.location.search;
  const section = (search as { section?: string }).section;
  const { isAdmin } = useAuth();
  // Active = exact match OR a prefix match where no other sidebar URL is a longer/more-specific match.
  const allUrls = [...main.map((i) => i.url), ...admin.map((i) => i.url)];
  const isActive = (u: string) => {
    if (path === u) return true;
    if (u === "/communication" && (path.startsWith("/chat") || path.startsWith("/channels"))) return true;
    if (!path.startsWith(u + "/")) return false;
    return !allUrls.some(
      (other) => other !== u && other.length > u.length && (path === other || path.startsWith(other + "/")),
    );
  };
  const unread = useCommUnread();
  const totalUnread = (unread.dm || 0) + (unread.channels || 0) + (unread.announcements || 0);
  const { can, isLoading: permsLoading } = usePermissions();

  const { setOpenMobile, isMobile } = useSidebar();
  const handleLinkClick = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-2 px-2 py-3">
          <div className="h-8 w-8 rounded-md bg-sidebar-primary text-sidebar-primary-foreground grid place-items-center font-bold">
            JD
          </div>
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
                .map((item) => {
                  if (item.url === "/communication") {
                    const active = isActive(item.url);
                    return (
                      <Collapsible
                        key={item.url}
                        asChild
                        defaultOpen={active}
                        className="group/collapsible"
                      >
                        <SidebarMenuItem>
                          <CollapsibleTrigger asChild>
                            <SidebarMenuButton tooltip={item.title} isActive={active}>
                              <item.icon />
                              <span>{item.title}</span>
                              {totalUnread > 0 && (
                                <Badge className="ml-2 h-5 min-w-5 justify-center px-1.5 text-[10px] shrink-0 group-data-[state=open]/collapsible:hidden group-data-[collapsible=icon]:absolute group-data-[collapsible=icon]:top-1 group-data-[collapsible=icon]:right-1 group-data-[collapsible=icon]:h-4 group-data-[collapsible=icon]:w-4 group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:text-[8px] group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:justify-center">
                                  {totalUnread > 99 ? "99+" : totalUnread}
                                </Badge>
                              )}
                              <ChevronRight className="ml-auto h-4 w-4 shrink-0 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                            </SidebarMenuButton>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <SidebarMenuSub>
                              <SidebarMenuSubItem>
                                <SidebarMenuSubButton asChild isActive={active && (section === "dm" || (!section && path === "/communication") || path.startsWith("/chat"))}>
                                  <Link to="/communication" search={{ section: "dm" }} className="flex items-center gap-2 w-full" onClick={handleLinkClick}>
                                    <MessageSquare className="h-4 w-4 shrink-0" />
                                    <span>Direct Messages</span>
                                    {unread.dm > 0 && (
                                      <Badge className="ml-auto h-5 min-w-5 justify-center px-1.5 text-[10px] shrink-0">
                                        {unread.dm > 99 ? "99+" : unread.dm}
                                      </Badge>
                                    )}
                                  </Link>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                              <SidebarMenuSubItem>
                                <SidebarMenuSubButton asChild isActive={active && (section === "channels" || path.startsWith("/channels"))}>
                                  <Link to="/communication" search={{ section: "channels" }} className="flex items-center gap-2 w-full" onClick={handleLinkClick}>
                                    <Hash className="h-4 w-4 shrink-0" />
                                    <span>Channels</span>
                                    {unread.channels > 0 && (
                                      <Badge className="ml-auto h-5 min-w-5 justify-center px-1.5 text-[10px] shrink-0">
                                        {unread.channels > 99 ? "99+" : unread.channels}
                                      </Badge>
                                    )}
                                  </Link>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                              <SidebarMenuSubItem>
                                <SidebarMenuSubButton asChild isActive={active && section === "announcements"}>
                                  <Link to="/communication" search={{ section: "announcements" }} className="flex items-center gap-2 w-full" onClick={handleLinkClick}>
                                    <Megaphone className="h-4 w-4 shrink-0" />
                                    <span>News & Updates</span>
                                    {unread.announcements > 0 && (
                                      <Badge className="ml-auto h-5 min-w-5 justify-center px-1.5 text-[10px] shrink-0">
                                        {unread.announcements > 99 ? "99+" : unread.announcements}
                                      </Badge>
                                    )}
                                  </Link>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            </SidebarMenuSub>
                          </CollapsibleContent>
                        </SidebarMenuItem>
                      </Collapsible>
                    );
                  }
                  return (
                    <SidebarMenuItem key={item.url}>
                      <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
                        <Link to={item.url} onClick={handleLinkClick}>
                          <item.icon />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
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
                        <Link to={item.url} onClick={handleLinkClick}>
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
