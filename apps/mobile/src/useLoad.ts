import { useEffect, useRef, useState } from "react";
import { messageFrom } from "./runtime";

export function useLoad<T>(loader: () => Promise<T>, refreshKey: number) {
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [localKey, setLocalKey] = useState(0);

  useEffect(() => {
    let live = true;
    setStatus("loading");
    loaderRef
      .current()
      .then((next) => {
        if (!live) return;
        setData(next);
        setError(null);
        setStatus("ready");
      })
      .catch((cause: unknown) => {
        if (!live) return;
        setError(messageFrom(cause));
        setStatus("error");
      });
    return () => {
      live = false;
    };
  }, [refreshKey, localKey]);

  return { status, data, error, reload: () => setLocalKey((value) => value + 1) };
}
