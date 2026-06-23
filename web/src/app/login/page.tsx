"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "../../context/useApp";
import LoginForm from "../../components/LoginForm";

export default function LoginPage() {
    const { isAuthenticated } = useApp();
    const router = useRouter();
    const [mounted, setMounted] = useState(false);

    useEffect(() => setMounted(true), []);
    useEffect(() => {
        if (mounted && isAuthenticated) router.replace("/dashboard");
    }, [mounted, isAuthenticated, router]);

    return <LoginForm />;
}
