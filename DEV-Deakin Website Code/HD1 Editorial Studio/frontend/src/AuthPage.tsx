import { useState, type FormEvent } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import {
  signupSchema,
  loginSchema,
  fieldErrors,
} from "../../shared/validation.ts";
import { useAuth } from "./auth.tsx";
import { ApiError, request, json } from "./api.ts";
import { Field, Notice } from "./components.tsx";
export default function AuthPage({ signup = false }: { signup?: boolean }) {
  const { login } = useAuth(),
    navigate = useNavigate(),
    location = useLocation();
  const [values, setValues] = useState({
      firstName: "",
      lastName: "",
      email: location.state?.email || "",
      password: "",
      confirmPassword: "",
    }),
    [errors, setErrors] = useState<Record<string, string>>({}),
    [message, setMessage] = useState(""),
    [pending, setPending] = useState(false);
  const change = (name: keyof typeof values, value: string) => {
    setValues((v) => ({ ...v, [name]: value }));
    setErrors((e) => ({ ...e, [name]: "" }));
  };
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (pending) return;
    setMessage("");
    const parsed = signup
      ? signupSchema.safeParse(values)
      : loginSchema.safeParse({
          email: values.email,
          password: values.password,
        });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setPending(true);
    try {
      if (signup) {
        await request("/auth/signup", json(parsed.data));
        navigate("/login", {
          state: { email: values.email, created: true },
          replace: true,
        });
      } else {
        await login(values.email, values.password);
        navigate("/", { replace: true });
      }
    } catch (e) {
      setMessage((e as Error).message);
      if (e instanceof ApiError) setErrors(e.errors);
    } finally {
      setPending(false);
    }
  }
  return (
    <main className="auth-wrap">
      <section className="auth-panel">
        <div className="auth-top">
          <span>{signup ? "Join the community" : "Welcome back"}</span>
          <Link to={signup ? "/login" : "/signup"}>
            {signup ? "Login" : "Sign up"}
          </Link>
        </div>
        <h1>{signup ? "Create a DEV@Deakin Account" : "Login"}</h1>
        {location.state?.created && !signup && (
          <Notice>Account created. Log in to continue.</Notice>
        )}
        <form onSubmit={submit} noValidate>
          {signup && (
            <div className="two-col">
              <Field
                label="First name"
                name="firstName"
                autoComplete="given-name"
                value={values.firstName}
                onChange={(e) => change("firstName", e.target.value)}
                error={errors.firstName}
              />
              <Field
                label="Last name"
                name="lastName"
                autoComplete="family-name"
                value={values.lastName}
                onChange={(e) => change("lastName", e.target.value)}
                error={errors.lastName}
              />
            </div>
          )}
          <Field
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            value={values.email}
            onChange={(e) => change("email", e.target.value)}
            error={errors.email}
          />
          <Field
            label="Password"
            name="password"
            type="password"
            autoComplete={signup ? "new-password" : "current-password"}
            value={values.password}
            onChange={(e) => change("password", e.target.value)}
            error={errors.password}
          />
          {signup && (
            <>
              <small>Use at least eight characters.</small>
              <Field
                label="Confirm password"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                value={values.confirmPassword}
                onChange={(e) => change("confirmPassword", e.target.value)}
                error={errors.confirmPassword}
              />
            </>
          )}
          {message && <Notice error>{message}</Notice>}
          <button className="wide" disabled={pending}>
            {pending ? "Please wait…" : signup ? "Create account" : "Login"}
          </button>
        </form>
      </section>
    </main>
  );
}
