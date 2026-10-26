import { redirect } from "next/navigation";

export default function CreateContentRedirect() {
  redirect("/admin-dashboard/content/add");
}
