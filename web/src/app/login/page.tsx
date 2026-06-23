"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../context/AuthProvider";
import LoginForm from "../../components/LoginForm";

export default function LoginPage() {
    const { status } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (status === "authenticated") router.replace("/dashboard");
    }, [status, router]);

    return <LoginForm />;
}
