import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";

// The dashboard's quick actions link to e.g. "/clients?new=1": run `open` once
// (the page's own "Add ..." button) and drop the parameter again.
export function useOpenNew(open) {
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    if (params.get("new")) {
      open();
      setParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
