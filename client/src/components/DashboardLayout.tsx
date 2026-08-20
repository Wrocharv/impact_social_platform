import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/useMobile";
import { trpc } from "@/lib/trpc";
import { Building2, CheckCircle2, FileText, Handshake, Home, Layout, LayoutDashboard, LogOut, PanelLeft, ShieldCheck, Users } from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation, useSearch } from "wouter";
import AdminLogin from "@/pages/AdminLogin";
import { DashboardLayoutSkeleton } from './DashboardLayoutSkeleton';

type AdminSectionKey = "campaigns" | "content" | "validations" | "partners" | "community" | "comments";

const SECTION_META: Record<AdminSectionKey, { label: string; icon: typeof Building2 }> = {
  campaigns: { label: "Campanhas", icon: Building2 },
  content: { label: "Conteúdo do site", icon: Layout },
  validations: { label: "Validações", icon: CheckCircle2 },
  partners: { label: "Parceiros", icon: Handshake },
  community: { label: "Comunidade", icon: Users },
  comments: { label: "Depoimentos", icon: FileText },
};

const NAV_GROUPS: { label: string; keys: AdminSectionKey[] }[] = [
  { label: "Campanhas", keys: ["campaigns"] },
  { label: "Financeiro", keys: ["validations"] },
  { label: "Relacionamento", keys: ["partners", "community", "comments"] },
  { label: "Site", keys: ["content"] },
];

type AdminSessionLike = { role: "owner" | "full" | "partial"; allowedSections: string[] } | null | undefined;

function canSeeSection(admin: AdminSessionLike, section: AdminSectionKey) {
  if (!admin) return false;
  return admin.role === "owner" || admin.role === "full" || admin.allowedSections.includes(section);
}

const SIDEBAR_WIDTH_KEY = "sidebar-width";
const DEFAULT_WIDTH = 280;
const MIN_WIDTH = 200;
const MAX_WIDTH = 480;

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const utils = trpc.useUtils();
  const adminMeQuery = trpc.adminAuth.me.useQuery();

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  if (adminMeQuery.isLoading) {
    return <DashboardLayoutSkeleton />
  }

  if (!adminMeQuery.data) {
    return <AdminLogin onSuccess={() => utils.adminAuth.me.invalidate()} />;
  }

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": `${sidebarWidth}px`,
        } as CSSProperties
      }
    >
      <DashboardLayoutContent setSidebarWidth={setSidebarWidth}>
        {children}
      </DashboardLayoutContent>
    </SidebarProvider>
  );
}

type DashboardLayoutContentProps = {
  children: React.ReactNode;
  setSidebarWidth: (width: number) => void;
};

function DashboardLayoutContent({
  children,
  setSidebarWidth,
}: DashboardLayoutContentProps) {
  const utils = trpc.useUtils();
  const adminMeQuery = trpc.adminAuth.me.useQuery();
  const admin = adminMeQuery.data;
  const logoutMutation = trpc.adminAuth.logout.useMutation({
    onSuccess: () => {
      utils.adminAuth.me.setData(undefined, null);
    },
  });
  const logout = () => logoutMutation.mutate();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const activeTab = (new URLSearchParams(search).get("tab") as AdminSectionKey | "administrators" | "overview" | null) ?? "overview";
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  const isOwner = admin?.role === "owner";
  const canValidate = canSeeSection(admin, "validations");
  const pendingCashQuery = trpc.contributions.getPendingCashValidations.useQuery(undefined, { enabled: Boolean(admin) && canValidate });
  const pendingMaterialQuery = trpc.contributions.getPendingMaterialValidations.useQuery(undefined, { enabled: Boolean(admin) && canValidate });
  const pendingValidationsCount = (pendingCashQuery.data?.length ?? 0) + (pendingMaterialQuery.data?.length ?? 0);
  const activeLabel =
    activeTab === "overview"
      ? "Visão geral"
      : activeTab === "administrators"
        ? "Administradores"
        : (activeTab in SECTION_META ? SECTION_META[activeTab as AdminSectionKey].label : "Gestão");

  useEffect(() => {
    if (isCollapsed) {
      setIsResizing(false);
    }
  }, [isCollapsed]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      const sidebarLeft = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const newWidth = e.clientX - sidebarLeft;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth]);

  return (
    <>
      <div className="relative" ref={sidebarRef}>
        <Sidebar
          collapsible="icon"
          className="border-r-0"
          disableTransition={isResizing}
        >
          <SidebarHeader className="h-16 justify-center">
            <div className="flex items-center gap-3 px-2 transition-all w-full">
              <button
                onClick={toggleSidebar}
                className="h-8 w-8 flex items-center justify-center hover:bg-accent rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
                aria-label="Toggle navigation"
              >
                <PanelLeft className="h-4 w-4 text-muted-foreground" />
              </button>
              {!isCollapsed ? (
                <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
                  <span className="font-semibold tracking-tight truncate">
                    Parceiros do Bem
                  </span>
                  <a
                    href="/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    title="Ver site público"
                  >
                    <Home className="h-3.5 w-3.5" />
                  </a>
                </div>
              ) : null}
            </div>
          </SidebarHeader>

          <SidebarContent className="gap-0">
            <SidebarGroup>
              <SidebarMenu className="px-2 py-1">
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={activeTab === "overview"}
                    onClick={() => setLocation("/admin?tab=overview")}
                    tooltip="Visão geral"
                    className="h-10 transition-all font-normal"
                  >
                    <LayoutDashboard className={`h-4 w-4 ${activeTab === "overview" ? "text-primary" : ""}`} />
                    <span>Visão geral</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroup>

            {NAV_GROUPS.map(group => {
              const keys = group.keys.filter(key => canSeeSection(admin, key));
              if (keys.length === 0) return null;
              return (
                <SidebarGroup key={group.label}>
                  <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
                  <SidebarMenu className="px-2 py-1">
                    {keys.map(key => {
                      const meta = SECTION_META[key];
                      const isActive = activeTab === key;
                      return (
                        <SidebarMenuItem key={key}>
                          <SidebarMenuButton
                            isActive={isActive}
                            onClick={() => setLocation(`/admin?tab=${key}`)}
                            tooltip={meta.label}
                            className="h-10 transition-all font-normal"
                          >
                            <meta.icon className={`h-4 w-4 ${isActive ? "text-primary" : ""}`} />
                            <span className="flex-1">{meta.label}</span>
                            {key === "validations" && pendingValidationsCount > 0 && (
                              <Badge variant="secondary" className="ml-auto h-5 min-w-5 justify-center px-1.5 group-data-[collapsible=icon]:hidden">
                                {pendingValidationsCount}
                              </Badge>
                            )}
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </SidebarGroup>
              );
            })}

            {isOwner && (
              <SidebarGroup>
                <SidebarGroupLabel>Configurações</SidebarGroupLabel>
                <SidebarMenu className="px-2 py-1">
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      isActive={activeTab === "administrators"}
                      onClick={() => setLocation("/admin?tab=administrators")}
                      tooltip="Administradores"
                      className="h-10 transition-all font-normal"
                    >
                      <ShieldCheck className={`h-4 w-4 ${activeTab === "administrators" ? "text-primary" : ""}`} />
                      <span>Administradores</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroup>
            )}
          </SidebarContent>

          <SidebarFooter className="p-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 rounded-lg px-1 py-1 hover:bg-accent/50 transition-colors w-full text-left group-data-[collapsible=icon]:justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Avatar className="h-9 w-9 border shrink-0">
                    <AvatarFallback className="text-xs font-medium">
                      {(admin?.name || admin?.email)?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                    <p className="text-sm font-medium truncate leading-none">
                      {admin?.name || "-"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate mt-1.5">
                      {admin?.email || "-"}
                    </p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  onClick={logout}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Sair</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>
        <div
          className={`absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/20 transition-colors ${isCollapsed ? "hidden" : ""}`}
          onMouseDown={() => {
            if (isCollapsed) return;
            setIsResizing(true);
          }}
          style={{ zIndex: 50 }}
        />
      </div>

      <SidebarInset>
        {isMobile && (
          <div className="flex border-b h-14 items-center justify-between bg-background/95 px-2 backdrop-blur supports-[backdrop-filter]:backdrop-blur sticky top-0 z-40">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="h-9 w-9 rounded-lg bg-background" />
              <div className="flex items-center gap-3">
                <div className="flex flex-col gap-1">
                  <span className="tracking-tight text-foreground">
                    {activeLabel}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
        {!isMobile && (
          <div className="flex h-12 items-center border-b border-[#e5e7eb] bg-white px-6 text-sm text-[#8a9089]">
            Administração <span className="mx-1.5">/</span> <span className="font-medium text-[#243128]">{activeLabel}</span>
          </div>
        )}
        <main className="flex-1 p-4">{children}</main>
      </SidebarInset>
    </>
  );
}
