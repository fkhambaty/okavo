import { backend, isBackendConfigured } from "./backend";

export type AuditAction =
  | "auth.sign_in"
  | "auth.sign_out"
  | "auth.idle_logout"
  | "auth.sign_up"
  | "payment.posting_fee"
  | "payment.membership_fee"
  | "payment.hire_success_fee"
  | "project.publish"
  | "project.lock"
  | "bid.place"
  | "bid.award"
  | "contract.countersign"
  | "milestone.fund"
  | "milestone.accept"
  | "identity.submit"
  | "clarification.ask"
  | "clarification.answer"
  | "guardrail.block"
  | "assist.request"
  | "assist.complete"
  | "terms.accept"
  | "block.request"
  | "block.approve"
  | "block.reject";

/**
 * Fire-and-forget audit write. Never throws to the caller — logging must not
 * break the product action that triggered it.
 */
export function logAudit(
  action: AuditAction,
  entityType: string,
  entityId?: string | null,
  detail?: Record<string, unknown>
): void {
  if (!isBackendConfigured) return;

  void backend("/v1/audit", {
    body: {
      action,
      entity_type: entityType,
      entity_id: entityId ?? null,
      detail: detail ?? {},
    },
  }).catch((error: unknown) => {
    if (import.meta.env.DEV) {
      console.warn("audit log failed", action, error);
    }
  });
}
