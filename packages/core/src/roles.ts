export type WorkspaceRole = "buyer" | "developer" | "admin";

export type NavItem = {
  href: string;
  label: string;
  roles: readonly WorkspaceRole[];
};

export const WORKSPACE_NAV: readonly NavItem[] = [
  { href: "/workspace", label: "Dashboard", roles: ["buyer", "developer", "admin"] },
  { href: "/workspace/requirements", label: "New requirement", roles: ["buyer", "admin"] },
  { href: "/workspace/developers", label: "Developers", roles: ["buyer", "admin"] },
  { href: "/workspace/bids", label: "Bids", roles: ["developer", "admin"] },
  { href: "/workspace/contracts", label: "Contracts", roles: ["buyer", "developer", "admin"] },
  { href: "/workspace/messages", label: "Messages", roles: ["buyer", "developer", "admin"] },
  { href: "/workspace/notifications", label: "Notifications", roles: ["buyer", "developer", "admin"] },
  { href: "/workspace/earnings", label: "Earnings", roles: ["developer", "admin"] },
  { href: "/workspace/verification", label: "Identity", roles: ["developer"] },
  { href: "/workspace/exams", label: "Build exam", roles: ["developer"] },
  { href: "/workspace/payments", label: "Payments", roles: ["buyer", "developer", "admin"] },
  { href: "/workspace/admin/verifications", label: "Identity queue", roles: ["admin"] },
  { href: "/workspace/admin/exams", label: "Exam queue", roles: ["admin"] },
  { href: "/workspace/admin/blocks", label: "Blocks", roles: ["admin"] },
  { href: "/workspace/admin/operations", label: "Operations", roles: ["admin"] },
  { href: "/workspace/admin/audit", label: "Audit", roles: ["admin"] },
  { href: "/workspace/account", label: "Account", roles: ["buyer", "developer", "admin"] },
];

export function isWorkspaceRole(value: string | null | undefined): value is WorkspaceRole {
  return value === "buyer" || value === "developer" || value === "admin";
}

export function navForRole(role: WorkspaceRole): NavItem[] {
  return WORKSPACE_NAV.filter((item) => item.roles.includes(role));
}

export function roleCanOpen(role: WorkspaceRole, href: string): boolean {
  const exact = WORKSPACE_NAV.find((entry) => entry.href === href);
  if (exact) return exact.roles.includes(role);
  const nested = WORKSPACE_NAV.filter((entry) => entry.href !== "/workspace" && href.startsWith(`${entry.href}/`)).sort(
    (left, right) => right.href.length - left.href.length,
  );
  const item = nested[0];
  if (!item) {
    return href.startsWith("/workspace/projects/") || href.startsWith("/workspace/messages/") || href.startsWith("/workspace/contracts/");
  }
  return item.roles.includes(role);
}
