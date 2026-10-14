import { MEMBERSHIP_FEE_LABEL, PAYMENTS_DISABLED_COPY, POSTING_FEE_LABEL } from "@okavo/core";
import { paymentQuote } from "../../src/calls";
import { useRefreshKey } from "../../src/refresh";
import { useLoad } from "../../src/useLoad";
import { Banner, Body, Card, Muted, Screen, StateView, Title } from "../../src/ui";

export default function Payments() {
  const refreshKey = useRefreshKey();
  const posting = useLoad(() => paymentQuote("requirement_posting"), refreshKey);
  const membership = useLoad(() => paymentQuote("bidding_membership"), refreshKey);
  return (
    <Screen>
      <Title>Payments</Title>
      <Banner>{PAYMENTS_DISABLED_COPY}</Banner>
      <Body>{`Displayed fees stay ${POSTING_FEE_LABEL} to post and ${MEMBERSHIP_FEE_LABEL} for membership. The quote below is what the server returned, with charge left off.`}</Body>
      <Quote title="Posting" state={posting} />
      <Quote title="Membership" state={membership} />
      <Muted>Returning from a payment link does not mark anything paid. There is no Razorpay checkout in this app.</Muted>
    </Screen>
  );
}

function Quote({
  title,
  state,
}: {
  title: string;
  state: { status: "loading" | "ready" | "error"; data: { label?: string; amount?: number; currency?: string; charge?: boolean; note?: string } | null; error: string | null };
}) {
  if (state.status === "loading") return <StateView status="loading" title={`Loading ${title.toLowerCase()} quote`} />;
  if (state.status === "error") return <StateView status="error" title={`${title} quote could not be loaded`} body={state.error || ""} />;
  if (!state.data) return <StateView status="empty" title={`${title} quote was empty`} />;
  return (
    <Card>
      <Body>{state.data.label || title}</Body>
      <Muted>{`${state.data.amount ?? "not recorded"} ${state.data.currency || ""}`}</Muted>
      <Muted>{state.data.charge === false ? "charge: false" : "This quote was refused because it was not display-only."}</Muted>
      {state.data.note ? <Muted>{state.data.note}</Muted> : null}
    </Card>
  );
}
