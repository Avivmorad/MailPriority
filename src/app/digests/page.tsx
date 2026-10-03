import { redirect } from "next/navigation";

/** Legacy Digests URL — History is the current screen. */
export default function DigestsRedirectPage() {
  redirect("/history");
}
