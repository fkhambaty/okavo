import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiBase } from "../lib/backend";
import { getAccessToken } from "../lib/sessionClient";

function nextPath(purpose: string) {
  if (purpose === "bidding_membership") return "/app/verification";
  if (purpose === "requirement_posting") return "/app/new";
  return "/app";
}

export default function PaymentReturn() {
  const [params] = useSearchParams();
  const [message, setMessage] = useState("Confirming your payment…");
  const [ok, setOk] = useState<boolean | null>(null);
  const [next, setNext] = useState("/app");

  useEffect(() => {
    const body = {
      razorpay_payment_id: params.get("razorpay_payment_id") || "",
      razorpay_payment_link_id: params.get("razorpay_payment_link_id") || "",
      razorpay_payment_link_reference_id: params.get("razorpay_payment_link_reference_id") || "",
      razorpay_payment_link_status: params.get("razorpay_payment_link_status") || "",
      razorpay_signature: params.get("razorpay_signature") || "",
    };
    let hinted = "";
    try {
      hinted = sessionStorage.getItem("okavo.checkout.purpose") || "";
    } catch {
      hinted = "";
    }
    if (!body.razorpay_payment_link_id) {
      setOk(false);
      setMessage("There is no payment to confirm on this page.");
      setNext(nextPath(hinted));
      return;
    }

    let cancelled = false;
    void (async () => {
      const base = apiBase();
      const token = await getAccessToken();
      if (!base || !token) {
        if (!cancelled) {
          setOk(false);
          setNext(nextPath(hinted));
          setMessage("Sign in again so this payment can be confirmed. Do not pay a second time.");
        }
        return;
      }
      try {
        const response = await fetch(`${base}/v1/payments/razorpay/link-return`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(body),
        });
        const payload = (await response.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          purpose?: string;
          status?: string;
        };
        if (cancelled) return;
        const purpose = payload.purpose || hinted;
        setNext(nextPath(purpose));
        if (!response.ok || !payload.ok) {
          setOk(false);
          setMessage(
            payload.error ||
              (payload.status
                ? `Payment status: ${payload.status}. Nothing was marked paid.`
                : "Payment could not be confirmed.")
          );
          return;
        }
        setOk(true);
        setMessage("Payment received. FKTech recorded it on your Okavo account.");
      } catch {
        if (!cancelled) {
          setOk(false);
          setNext(nextPath(hinted));
          setMessage("Could not reach the payment confirmer. Do not pay again until this page succeeds.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params]);

  return (
    <>
      <header className="topbar">
        <h1>Payment</h1>
      </header>
      <div className="content">
        <div className={ok ? "callout callout-ok" : "callout"} role="status">
          <span>{ok ? "✓" : "!"}</span>
          <span>{message}</span>
        </div>
        {ok !== null && (
          <p style={{ marginTop: "1rem" }}>
            <Link className="btn" to={next}>
              Continue
            </Link>
          </p>
        )}
      </div>
    </>
  );
}
