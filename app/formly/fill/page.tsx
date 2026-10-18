import { Suspense } from "react";
import { FillFlow } from "./FillFlow";

export default function FillPage() {
  return (
    <Suspense fallback={null}>
      <FillFlow />
    </Suspense>
  );
}
