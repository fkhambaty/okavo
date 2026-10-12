import { lazy, Suspense, useEffect, type ReactElement, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import AppShell from "./components/AppShell";
import LoadingState from "./components/LoadingState";
import { TermsGate } from "./components/TermsGate";
import { trackPageView } from "./lib/analytics";
import { IdleSessionGuard } from "./lib/idleSession";
import { applySeo } from "./lib/seo";
import { useAuth } from "./lib/auth";
import { StoreProvider, useStore } from "./store";

/** Marketing + workspace pages load on demand — keeps first paint off the 700KB monolith. */
const About = lazy(() => import("./pages/About"));
const ContractPage = lazy(() => import("./pages/ContractPage"));
const ContractsList = lazy(() => import("./pages/ContractsList"));
const ExampleWalkthrough = lazy(() => import("./pages/ExampleWalkthrough"));
const Faq = lazy(() => import("./pages/Faq"));
const Guarantee = lazy(() => import("./pages/Guarantee"));
const HowItWorks = lazy(() => import("./pages/HowItWorks"));
const Landing = lazy(() => import("./pages/Landing"));
const Privacy = lazy(() => import("./pages/Privacy"));
const Security = lazy(() => import("./pages/Security"));
const Terms = lazy(() => import("./pages/Terms"));
const Messages = lazy(() => import("./pages/Messages"));
const Notifications = lazy(() => import("./pages/Notifications"));
const SignIn = lazy(() => import("./pages/SignIn"));
const AdminAnalytics = lazy(() => import("./pages/admin/AdminAnalytics"));
const AdminAuditLogs = lazy(() => import("./pages/admin/AdminAuditLogs"));
const AdminExams = lazy(() => import("./pages/admin/AdminExams"));
const AdminBlocks = lazy(() => import("./pages/admin/AdminBlocks"));
const AdminOperations = lazy(() => import("./pages/admin/AdminOperations"));
const AdminHome = lazy(() => import("./pages/admin/AdminHome"));
const AdminVerifications = lazy(() => import("./pages/admin/AdminVerifications"));
const BuyerHome = lazy(() => import("./pages/buyer/BuyerHome"));
const BuyerProject = lazy(() => import("./pages/buyer/BuyerProject"));
const DeveloperProfile = lazy(() => import("./pages/buyer/DeveloperProfile"));
const Developers = lazy(() => import("./pages/buyer/Developers"));
const NewRequirement = lazy(() => import("./pages/buyer/NewRequirement"));
const Payments = lazy(() => import("./pages/buyer/Payments"));
const PaymentReturn = lazy(() => import("./pages/PaymentReturn"));
const DevBids = lazy(() => import("./pages/developer/DevBids"));
const DevBoard = lazy(() => import("./pages/developer/DevBoard"));
const DevProject = lazy(() => import("./pages/developer/DevProject"));
const Earnings = lazy(() => import("./pages/developer/Earnings"));
const Verification = lazy(() => import("./pages/developer/Verification"));

function RouteFallback() {
  return <LoadingState label="Loading…" />;
}

function Lazy({ children }: { children: ReactNode }) {
  return <Suspense fallback={<RouteFallback />}>{children}</Suspense>;
}

function RequireAuth({ children }: { children: ReactElement }) {
  const { role, ready } = useAuth();
  if (!ready) {
    return <LoadingState label="Loading your workspace…" />;
  }
  // Signing out drops the role to guest while the workspace is still mounted,
  // so this is also the redirect that runs on sign-out. Send people home
  // rather than to a sign-in form they did not ask for.
  if (role === "guest") return <Navigate to="/" replace />;
  return children;
}

function BuyerOnly({ children }: { children: ReactElement }) {
  const { role } = useStore();
  if (role !== "buyer") return <Navigate to="/app" replace />;
  return children;
}

function DeveloperOnly({ children }: { children: ReactElement }) {
  const { role } = useStore();
  if (role !== "developer") return <Navigate to="/app" replace />;
  return children;
}

function AdminOnly({ children }: { children: ReactElement }) {
  const { role } = useStore();
  if (role !== "admin") return <Navigate to="/app" replace />;
  return children;
}

function Home() {
  const { role } = useAuth();
  if (role === "guest") return <Landing />;
  return <Navigate to="/app" replace />;
}

function Dashboard() {
  const { role } = useStore();
  if (role === "admin") return <AdminHome />;
  return role === "buyer" ? <BuyerHome /> : <DevBoard />;
}

function ProjectRoute() {
  const { role } = useStore();
  return role === "buyer" ? <BuyerProject /> : <DevProject />;
}

/** Landing on a new page half way down it is disorienting. */
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
    applySeo(pathname);
  }, [pathname]);
  return null;
}

function PageViews() {
  const { pathname, search } = useLocation();
  const { userId } = useAuth();
  useEffect(() => {
    trackPageView(userId);
  }, [pathname, search, userId]);
  return null;
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <PageViews />
      <IdleSessionGuard />
      <Lazy>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/how-it-works" element={<HowItWorks />} />
          <Route path="/example" element={<ExampleWalkthrough />} />
          <Route path="/guarantee" element={<Guarantee />} />
          <Route path="/security" element={<Security />} />
          <Route path="/faq" element={<Faq />} />
          <Route path="/about" element={<About />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/signin" element={<SignIn />} />
          <Route
            path="/app"
            element={
              <RequireAuth>
                <StoreProvider>
                  <TermsGate>
                    <AppShell />
                  </TermsGate>
                </StoreProvider>
              </RequireAuth>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="project/:id" element={<ProjectRoute />} />
            <Route path="contract/:id" element={<ContractPage />} />
            <Route path="contracts" element={<ContractsList />} />
            <Route path="messages" element={<Messages />} />
            <Route path="notifications" element={<Notifications />} />
            <Route
              path="new"
              element={
                <BuyerOnly>
                  <NewRequirement />
                </BuyerOnly>
              }
            />
            <Route path="payments/return" element={<PaymentReturn />} />
            <Route
              path="payments"
              element={
                <BuyerOnly>
                  <Payments />
                </BuyerOnly>
              }
            />
            <Route
              path="developers"
              element={
                <BuyerOnly>
                  <Developers />
                </BuyerOnly>
              }
            />
            <Route
              path="developers/:id"
              element={
                <BuyerOnly>
                  <DeveloperProfile />
                </BuyerOnly>
              }
            />
            <Route
              path="bids"
              element={
                <DeveloperOnly>
                  <DevBids />
                </DeveloperOnly>
              }
            />
            <Route
              path="earnings"
              element={
                <DeveloperOnly>
                  <Earnings />
                </DeveloperOnly>
              }
            />
            <Route
              path="verification"
              element={
                <DeveloperOnly>
                  <Verification />
                </DeveloperOnly>
              }
            />
            <Route
              path="verifications"
              element={
                <AdminOnly>
                  <AdminVerifications />
                </AdminOnly>
              }
            />
            <Route
              path="traffic"
              element={
                <AdminOnly>
                  <AdminAnalytics />
                </AdminOnly>
              }
            />
            <Route
              path="audit"
              element={
                <AdminOnly>
                  <AdminAuditLogs />
                </AdminOnly>
              }
            />
            <Route
              path="exams"
              element={
                <AdminOnly>
                  <AdminExams />
                </AdminOnly>
              }
            />
            <Route
              path="blocks"
              element={
                <AdminOnly>
                  <AdminBlocks />
                </AdminOnly>
              }
            />
            <Route
              path="operations"
              element={
                <AdminOnly>
                  <AdminOperations />
                </AdminOnly>
              }
            />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Lazy>
    </>
  );
}
