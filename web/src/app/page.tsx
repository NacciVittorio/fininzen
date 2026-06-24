import { redirect } from "next/navigation";

// "/" lands on the dashboard; AuthGate bounces unauthenticated visitors to
// /login.
export default function Home() {
    redirect("/dashboard");
}
