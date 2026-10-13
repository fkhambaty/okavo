import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import * as api from "./lib/api";
import { useAuth } from "./lib/auth";
import { isBackendConfigured } from "./lib/backend";
import { MEMBERSHIP_FEE_MINOR, POSTING_FEE_MINOR } from "./lib/pricing";
import {
  DUMMY_DEVELOPER_ACCOUNT,
  FIXTURE_DEVELOPER_ACCOUNT,
  NEW_DEVELOPER_ACCOUNT,
  NOTIFICATIONS,
  PROJECTS,
  THREADS,
} from "./data";
import type {
  AppNotification,
  Bid,
  ChangeOrder,
  DeveloperAccount,
  Dispute,
  Milestone,
  Project,
  ReviewScores,
  Role,
  ScopeItem,
  Thread,
} from "./types";
import { errorMessage } from "./lib/errors";

type NewProjectInput = {
  title: string;
  category: string;
  outcome: string;
  budgetMin: number;
  budgetMax: number;
  monthlyOps: number;
  timelineWeeks: number;
  scale: Project["scale"];
  scope: ScopeItem[];
};

type StoreValue = {
  role: Role;
  name: string;
  email: string | null;
  userId: string | null;
  connected: boolean;
  demoMode: boolean;
  loading: boolean;
  /** False until the first live fetch settles, so pages can hold back empty states. */
  hydrated: boolean;
  error: string | null;
  projects: Project[];
  /** Only the requirements the signed-in buyer owns. */
  myProjects: Project[];
  threads: Thread[];
  notifications: AppNotification[];
  developerAccount: DeveloperAccount;

  signOut: () => Promise<void>;
  refresh: () => Promise<void>;

  postingFeesPaid: number;
  payPostingFee: () => Promise<void>;
  createProject: (input: NewProjectInput) => Promise<string>;
  lockProject: (projectId: string) => Promise<void>;

  placeBid: (
    projectId: string,
    input: { amount: number; monthlyOps: number; weeks: number; note: string }
  ) => Promise<boolean>;
  setBidStatus: (projectId: string, bidId: string, status: Bid["status"]) => void;
  awardBid: (projectId: string, bidId: string) => void;
  countersignContract: (projectId: string) => void;
  inviteBuilder: (projectId: string, email: string) => Promise<void>;

  payMembership: () => void;
  submitInterview: () => void;

  fundMilestone: (
    projectId: string,
    milestoneId: string
  ) => void | Promise<boolean>;
  submitMilestone: (
    projectId: string,
    milestoneId: string,
    summary: string,
    previewUrl: string
  ) => void;
  acceptMilestone: (projectId: string, milestoneId: string) => void;

  createChangeOrder: (
    projectId: string,
    input: { title: string; description: string; raisedBy: "buyer" | "developer" }
  ) => void;
  priceChangeOrder: (
    projectId: string,
    changeOrderId: string,
    amount: number,
    addedWeeks: number
  ) => void;
  decideChangeOrder: (
    projectId: string,
    changeOrderId: string,
    accepted: boolean
  ) => void;

  raiseDispute: (
    projectId: string,
    reason: string,
    raisedBy: "buyer" | "developer",
    scopeItemIds?: string[]
  ) => void;
  resolveDispute: (projectId: string, note: string) => void;

  leaveReview: (
    projectId: string,
    input: { scores: ReviewScores; comment: string; author: string }
  ) => void;

  sendMessage: (threadId: string, body: string) => void;
  markAllNotificationsRead: () => void;
  markNotificationRead: (notificationId: string) => void;
};

const StoreContext = createContext<StoreValue | null>(null);

function makeLockId() {
  return `LOCK-${Math.random().toString(16).slice(2, 8).toUpperCase()}`;
}

function today() {
  return new Date().toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function timestamp() {
  return new Date().toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function defaultMilestones(total: number): Milestone[] {
  const first = Math.round(total * 0.35);
  const second = Math.round(total * 0.4);
  return [
    {
      id: `ms-${Date.now()}-1`,
      title: "Foundation and core flows",
      description: "Environment, data model, and the first locked scope items.",
      amount: first,
      status: "pending",
      dueOn: today(),
    },
    {
      id: `ms-${Date.now()}-2`,
      title: "Main functionality",
      description: "The bulk of the locked scope, demoed weekly.",
      amount: second,
      status: "pending",
      dueOn: today(),
    },
    {
      id: `ms-${Date.now()}-3`,
      title: "Acceptance and handover",
      description: "Every scope item verified, documentation and deployment.",
      amount: total - first - second,
      status: "pending",
      dueOn: today(),
    },
  ];
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const live = isBackendConfigured && Boolean(auth.userId);

  // A configured backend must never render seeded demo rows: a real buyer
  // seeing another company's requirement is a privacy failure, not a preview.
  const [projects, setProjects] = useState<Project[]>(
    isBackendConfigured ? [] : PROJECTS
  );
  const [threads, setThreads] = useState<Thread[]>(
    isBackendConfigured ? [] : THREADS
  );
  const [notifications, setNotifications] = useState<AppNotification[]>(
    isBackendConfigured ? [] : NOTIFICATIONS
  );
  const [developerAccount, setDeveloperAccount] = useState<DeveloperAccount>(
    NEW_DEVELOPER_ACCOUNT
  );
  const [loading, setLoading] = useState(false);
  const [hydrated, setHydrated] = useState(!isBackendConfigured);
  const [error, setError] = useState<string | null>(null);
  const [postingFeesPaid, setPostingFeesPaid] = useState(0);

  useEffect(() => {
    if (auth.demoMode) {
      setProjects(PROJECTS);
      setThreads(THREADS);
      setNotifications(NOTIFICATIONS);
      setDeveloperAccount(
        auth.role === "developer"
          ? FIXTURE_DEVELOPER_ACCOUNT
          : DUMMY_DEVELOPER_ACCOUNT
      );
      setPostingFeesPaid(0);
      setError(null);
      setHydrated(true);
      return;
    }
    if (isBackendConfigured && !auth.userId) {
      setProjects([]);
      setThreads([]);
      setNotifications([]);
      setHydrated(false);
    }
  }, [auth.demoMode, auth.userId, auth.role]);

  const refresh = useCallback(async () => {
    if (!live || !auth.userId) return;
    setLoading(true);
    setError(null);
    try {
      const [nextProjects, nextThreads, nextNotifications] = await Promise.all([
        api.fetchProjects(auth.userId),
        api.fetchThreads(auth.userId),
        api.fetchNotifications(auth.userId),
      ]);
      setProjects(nextProjects);
      setThreads(nextThreads);
      setNotifications(nextNotifications);

      if (auth.role === "developer") {
        setDeveloperAccount(await api.fetchDeveloperAccount(auth.userId));
      } else {
        setPostingFeesPaid(await api.countPostingFees(auth.userId));
      }
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
      setHydrated(true);
    }
  }, [live, auth.userId, auth.role]);

  useEffect(() => {
    if (live) refresh();
  }, [live, refresh]);

  /** Resolves true only when the action reached the backend without error. */
  const run = useCallback(
    async (action: () => Promise<void>) => {
      setError(null);
      try {
        await action();
        await refresh();
        return true;
      } catch (cause) {
        setError(errorMessage(cause));
        return false;
      }
    },
    [refresh]
  );

  const patchProject = useCallback(
    (projectId: string, patch: (project: Project) => Project) => {
      setProjects((prev) =>
        prev.map((project) => (project.id === projectId ? patch(project) : project))
      );
    },
    []
  );

  const notify = useCallback((notification: Omit<AppNotification, "id">) => {
    setNotifications((prev) => [
      { ...notification, id: `n-${Date.now()}` },
      ...prev,
    ]);
  }, []);

  const payPostingFee = useCallback(async () => {
    if (live && auth.userId) {
      try {
        await api.payPostingFee(auth.userId, POSTING_FEE_MINOR);
      } catch (cause) {
        setError(errorMessage(cause));
        throw cause;
      }
    }
    setPostingFeesPaid((count) => count + 1);
  }, [live, auth.userId]);

  const createProject = useCallback(
    async (input: NewProjectInput) => {
      if (live && auth.userId) {
        try {
          const id = await api.createProject(auth.userId, input);
          await refresh();
          return id;
        } catch (cause) {
          setError(errorMessage(cause));
          return "";
        }
      }

      const id = `new-${Date.now()}`;
      setProjects((prev) => [
        {
          id,
          title: input.title,
          org: auth.displayName || "My business",
          scale: input.scale,
          category: input.category,
          outcome: input.outcome,
          budgetMin: input.budgetMin,
          budgetMax: input.budgetMax,
          monthlyOps: input.monthlyOps,
          timelineWeeks: input.timelineWeeks,
          skills: [input.category],
          scope: input.scope,
          stage: "clarifying",
          postedAgo: "Just now",
          warrantyDays: 30,
          bids: [],
          publicBidCount: 0,
          milestones: [],
          changeOrders: [],
          versions: [],
          reviews: [],
          ownedByMe: true,
        },
        ...prev,
      ]);
      return id;
    },
    [live, auth.userId, auth.displayName, refresh]
  );

  const lockProject = useCallback(
    async (projectId: string) => {
      const project = projects.find((item) => item.id === projectId);
      if (live && auth.userId && project) {
        await run(() =>
          api.lockProject(
            projectId,
            auth.userId as string,
            project.monthlyOps,
            project.timelineWeeks
          )
        );
        return;
      }

      patchProject(projectId, (item) => ({
        ...item,
        stage: "locked",
        lockedAt: today(),
        lockId: item.lockId ?? makeLockId(),
        versions: [
          ...item.versions,
          {
            version: item.versions.length + 1,
            reason: "Requirement locked",
            createdAt: today(),
          },
        ],
      }));
      notify({
        kind: "contract",
        title: "Requirement locked",
        body: "Bidding is now open to verified developers.",
        link: `/app/contract/${projectId}`,
        read: false,
        createdAt: today(),
      });
    },
    [live, auth.userId, projects, run, patchProject, notify]
  );

  const placeBid = useCallback(
    async (
      projectId: string,
      input: { amount: number; monthlyOps: number; weeks: number; note: string }
    ) => {
      if (live && auth.userId) {
        return run(() => api.placeBid(projectId, auth.userId as string, input));
      }

      const bid: Bid = {
        id: `bid-${Date.now()}`,
        developerId: "me",
        developerName: auth.displayName || "You",
        country: "Remote",
        tier: developerAccount.tier,
        amount: input.amount,
        monthlyOps: input.monthlyOps,
        weeks: input.weeks,
        note: input.note,
        status: "submitted",
        submittedAt: today(),
      };
      patchProject(projectId, (project) => ({
        ...project,
        bids: [bid, ...project.bids],
      }));
      return true;
    },
    [live, auth.userId, auth.displayName, developerAccount.tier, run, patchProject]
  );

  const setBidStatus = useCallback(
    (projectId: string, bidId: string, status: Bid["status"]) => {
      if (live) {
        void run(() => api.setBidStatus(bidId, status));
        return;
      }
      patchProject(projectId, (project) => ({
        ...project,
        bids: project.bids.map((bid) =>
          bid.id === bidId ? { ...bid, status } : bid
        ),
      }));
    },
    [live, run, patchProject]
  );

  const awardBid = useCallback(
    (projectId: string, bidId: string) => {
      const project = projects.find((item) => item.id === projectId);
      const winner = project?.bids.find((bid) => bid.id === bidId);
      if (live && winner) {
        void run(() => api.awardBid(projectId, bidId, winner.amount));
        return;
      }
      if (!winner) return;

      patchProject(projectId, (item) => ({
        ...item,
        stage: "hired",
        awardedTo: winner.developerName,
        developerSignedAt: undefined,
        bids: item.bids.map((bid) => ({
          ...bid,
          status:
            bid.id === bidId
              ? "awarded"
              : bid.status === "awarded"
                ? "declined"
                : bid.status,
        })),
        milestones:
          item.milestones.length > 0
            ? item.milestones
            : defaultMilestones(winner.amount),
        versions: [
          ...item.versions,
          {
            version: item.versions.length + 1,
            reason: `Awarded to ${winner.developerName} — awaiting countersign`,
            createdAt: today(),
          },
        ],
      }));
      notify({
        kind: "contract",
        title: "Developer hired",
        body: "Waiting for the developer to countersign the locked scope.",
        link: `/app/contract/${projectId}`,
        read: false,
        createdAt: today(),
      });
    },
    [live, projects, run, patchProject, notify]
  );

  const countersignContract = useCallback(
    (projectId: string) => {
      if (live) {
        void run(() => api.countersignContract(projectId));
        return;
      }
      const awarded = projects
        .find((item) => item.id === projectId)
        ?.bids.find((bid) => bid.status === "awarded");
      patchProject(projectId, (item) => ({
        ...item,
        stage: "in_delivery",
        developerSignedAt: today(),
        versions: [
          ...item.versions,
          {
            version: item.versions.length + 1,
            reason: `Countersigned by ${awarded?.developerName ?? "developer"}`,
            createdAt: today(),
          },
        ],
      }));
      notify({
        kind: "contract",
        title: "Lock countersigned",
        body: "Both parties have signed. Milestones are ready.",
        link: `/app/contract/${projectId}`,
        read: false,
        createdAt: today(),
      });
    },
    [live, projects, run, patchProject, notify]
  );

  const inviteBuilder = useCallback(
    async (projectId: string, email: string) => {
      if (live) {
        const ok = await run(() =>
          api.inviteBuilderToProject(projectId, email).then(() => undefined)
        );
        if (!ok) throw new Error("Invite failed");
        return;
      }
      notify({
        kind: "contract",
        title: "Invite sent",
        body: `Invitation prepared for ${email.trim()}.`,
        link: `/app/project/${projectId}`,
        read: false,
        createdAt: today(),
      });
    },
    [live, run, notify]
  );

  const payMembership = useCallback(() => {
    if (live && auth.userId) {
      void run(() =>
        api.payMembership(auth.userId as string, MEMBERSHIP_FEE_MINOR)
      );
      return;
    }
    setDeveloperAccount((prev) => ({
      ...prev,
      membershipPaid: true,
      membershipPaidAt: today(),
    }));
    notify({
      kind: "payment",
      title: "Bidding activated",
      body: "Your one-time bidding membership is paid.",
      link: "/app",
      read: false,
      createdAt: today(),
    });
  }, [live, auth.userId, run, notify]);

  const submitInterview = useCallback(() => {
    if (live && auth.userId) {
      void run(() => api.submitInterview(auth.userId as string));
      return;
    }
    setDeveloperAccount((prev) => ({ ...prev, interviewStatus: "approved" }));
  }, [live, auth.userId, run]);

  const fundMilestone = useCallback(
    async (projectId: string, milestoneId: string) => {
      if (live) {
        return run(() => api.fundMilestone(milestoneId));
      }
      patchProject(projectId, (project) => ({
        ...project,
        milestones: project.milestones.map((milestone) =>
          milestone.id === milestoneId
            ? { ...milestone, status: "funded" }
            : milestone
        ),
      }));
      return true;
    },
    [live, run, patchProject]
  );

  const submitMilestone = useCallback(
    (
      projectId: string,
      milestoneId: string,
      summary: string,
      previewUrl: string
    ) => {
      if (live && auth.userId) {
        void run(() =>
          api.submitMilestone(
            milestoneId,
            auth.userId as string,
            summary,
            previewUrl
          )
        );
        return;
      }
      patchProject(projectId, (project) => ({
        ...project,
        milestones: project.milestones.map((milestone) =>
          milestone.id === milestoneId
            ? {
                ...milestone,
                status: "submitted",
                deliverable: { summary, previewUrl, submittedAt: today() },
              }
            : milestone
        ),
      }));
    },
    [live, auth.userId, run, patchProject]
  );

  const acceptMilestone = useCallback(
    (projectId: string, milestoneId: string) => {
      if (live) {
        void run(() => api.acceptMilestone(milestoneId));
        return;
      }
      patchProject(projectId, (project) => {
        const milestones = project.milestones.map((milestone) =>
          milestone.id === milestoneId
            ? { ...milestone, status: "released" as const }
            : milestone
        );
        const allDone = milestones.every((m) => m.status === "released");
        return {
          ...project,
          milestones,
          stage: allDone ? "delivered" : project.stage,
        };
      });
    },
    [live, run, patchProject]
  );

  const createChangeOrder = useCallback(
    (
      projectId: string,
      input: { title: string; description: string; raisedBy: "buyer" | "developer" }
    ) => {
      if (live && auth.userId) {
        void run(() =>
          api.createChangeOrder(
            projectId,
            auth.userId as string,
            input.title,
            input.description
          )
        );
        return;
      }
      const changeOrder: ChangeOrder = {
        id: `co-${Date.now()}`,
        title: input.title,
        description: input.description,
        status: "proposed",
        addedWeeks: 0,
        raisedBy: input.raisedBy,
        createdAt: today(),
      };
      patchProject(projectId, (project) => ({
        ...project,
        changeOrders: [changeOrder, ...project.changeOrders],
      }));
    },
    [live, auth.userId, run, patchProject]
  );

  const priceChangeOrder = useCallback(
    (
      projectId: string,
      changeOrderId: string,
      amount: number,
      addedWeeks: number
    ) => {
      if (live) {
        void run(() => api.priceChangeOrder(changeOrderId, amount, addedWeeks));
        return;
      }
      patchProject(projectId, (project) => ({
        ...project,
        changeOrders: project.changeOrders.map((order) =>
          order.id === changeOrderId
            ? { ...order, status: "priced", amount, addedWeeks }
            : order
        ),
      }));
    },
    [live, run, patchProject]
  );

  const decideChangeOrder = useCallback(
    (projectId: string, changeOrderId: string, accepted: boolean) => {
      if (live) {
        void run(() => api.decideChangeOrder(projectId, changeOrderId, accepted));
        return;
      }
      patchProject(projectId, (project) => {
        const order = project.changeOrders.find((c) => c.id === changeOrderId);
        const changeOrders = project.changeOrders.map((c) =>
          c.id === changeOrderId
            ? {
                ...c,
                status: accepted ? ("accepted" as const) : ("declined" as const),
              }
            : c
        );
        if (!accepted || !order) return { ...project, changeOrders };
        return {
          ...project,
          changeOrders,
          timelineWeeks: project.timelineWeeks + order.addedWeeks,
          scope: [
            ...project.scope,
            {
              id: `sc-${order.id}`,
              label: order.title,
              detail: `Added by change order on ${today()}.`,
              included: true,
            },
          ],
          versions: [
            ...project.versions,
            {
              version: project.versions.length + 1,
              reason: `Change order accepted: ${order.title}`,
              createdAt: today(),
            },
          ],
        };
      });
    },
    [live, run, patchProject]
  );

  const raiseDispute = useCallback(
    (
      projectId: string,
      reason: string,
      raisedBy: "buyer" | "developer",
      scopeItemIds: string[] = []
    ) => {
      if (live && auth.userId) {
        void run(() =>
          api.raiseDispute(
            projectId,
            auth.userId as string,
            reason,
            scopeItemIds
          )
        );
        return;
      }
      const dispute: Dispute = {
        id: `dp-${Date.now()}`,
        reason,
        status: "open",
        raisedBy,
        createdAt: today(),
        scopeItemIds: scopeItemIds.length > 0 ? scopeItemIds : undefined,
      };
      patchProject(projectId, (project) => ({ ...project, dispute }));
    },
    [live, auth.userId, run, patchProject]
  );

  const resolveDispute = useCallback(
    (projectId: string, note: string) => {
      const project = projects.find((item) => item.id === projectId);
      if (live && project?.dispute) {
        void run(() => api.resolveDispute(project.dispute!.id, note));
        return;
      }
      patchProject(projectId, (item) =>
        item.dispute
          ? {
              ...item,
              dispute: { ...item.dispute, status: "resolved", resolutionNote: note },
            }
          : item
      );
    },
    [live, projects, run, patchProject]
  );

  const leaveReview = useCallback(
    (
      projectId: string,
      input: { scores: ReviewScores; comment: string; author: string }
    ) => {
      if (live && auth.userId) {
        void run(() =>
          api.leaveReview(projectId, auth.userId as string, {
            scores: input.scores,
            comment: input.comment,
          })
        );
        return;
      }

      const average =
        (input.scores.scope +
          input.scores.quality +
          input.scores.communication +
          input.scores.timeliness) /
        4;

      patchProject(projectId, (project) => ({
        ...project,
        stage: "closed",
        reviews: [
          ...project.reviews,
          {
            id: `rv-${Date.now()}`,
            createdAt: today(),
            rating: average,
            scores: input.scores,
            matchedExpectation: input.scores.scope >= 4,
            comment: input.comment,
            author: input.author,
          },
        ],
      }));
    },
    [live, auth.userId, run, patchProject]
  );

  const sendMessage = useCallback(
    (threadId: string, body: string) => {
      if (live && auth.userId) {
        void run(() => api.sendMessage(threadId, auth.userId as string, body));
        return;
      }
      setThreads((prev) =>
        prev.map((thread) =>
          thread.id === threadId
            ? {
                ...thread,
                messages: [
                  ...thread.messages,
                  {
                    id: `msg-${Date.now()}`,
                    from: auth.role === "buyer" ? "buyer" : "developer",
                    authorName: auth.displayName || "You",
                    body,
                    sentAt: timestamp(),
                  },
                ],
              }
            : thread
        )
      );
    },
    [live, auth.userId, auth.role, auth.displayName, run]
  );

  const markAllNotificationsRead = useCallback(() => {
    // Clear the badge immediately; the refresh inside run() confirms it.
    setNotifications((prev) =>
      prev.every((item) => item.read)
        ? prev
        : prev.map((item) => ({ ...item, read: true }))
    );
    if (live && auth.userId) {
      void run(() => api.markNotificationsRead(auth.userId as string));
    }
  }, [live, auth.userId, run]);

  const markNotificationRead = useCallback(
    (notificationId: string) => {
      setNotifications((prev) =>
        prev.map((item) =>
          item.id === notificationId ? { ...item, read: true } : item
        )
      );
      if (live && auth.userId) {
        void run(() => api.markNotificationRead(notificationId));
      }
    },
    [live, auth.userId, run]
  );

  // Without a backend the seeded tour is the whole product, so it stays visible.
  // With a backend, a buyer only ever sees requirements they own.
  const myProjects = useMemo(
    () =>
      isBackendConfigured && !auth.demoMode
        ? projects.filter((project) => project.ownedByMe)
        : projects,
    [projects, auth.demoMode]
  );

  const value = useMemo(
    () => ({
      role: auth.role,
      name: auth.displayName,
      email: auth.email,
      userId: auth.userId,
      connected: isBackendConfigured && !auth.demoMode,
      demoMode: auth.demoMode,
      loading,
      hydrated,
      error,
      projects,
      myProjects,
      threads,
      notifications,
      developerAccount,
      signOut: auth.signOut,
      refresh,
      postingFeesPaid,
      payPostingFee,
      createProject,
      lockProject,
      placeBid,
      setBidStatus,
      awardBid,
      countersignContract,
      inviteBuilder,
      payMembership,
      submitInterview,
      fundMilestone,
      submitMilestone,
      acceptMilestone,
      createChangeOrder,
      priceChangeOrder,
      decideChangeOrder,
      raiseDispute,
      resolveDispute,
      leaveReview,
      sendMessage,
      markAllNotificationsRead,
      markNotificationRead,
    }),
    [
      auth.role,
      auth.displayName,
      auth.email,
      auth.userId,
      auth.demoMode,
      auth.signOut,
      loading,
      hydrated,
      error,
      projects,
      myProjects,
      threads,
      notifications,
      developerAccount,
      refresh,
      postingFeesPaid,
      payPostingFee,
      createProject,
      lockProject,
      placeBid,
      setBidStatus,
      awardBid,
      countersignContract,
      inviteBuilder,
      payMembership,
      submitInterview,
      fundMilestone,
      submitMilestone,
      acceptMilestone,
      createChangeOrder,
      priceChangeOrder,
      decideChangeOrder,
      raiseDispute,
      resolveDispute,
      leaveReview,
      sendMessage,
      markAllNotificationsRead,
      markNotificationRead,
    ]
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside StoreProvider");
  return ctx;
}
