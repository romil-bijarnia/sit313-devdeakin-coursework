import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { upgradeSchema, fieldErrors } from "../../shared/validation.ts";
import { useAuth } from "./auth.tsx";
import { request, json, ApiError } from "./api.ts";
import type { PublicUser } from "../../shared/types.ts";
import { Field, Notice } from "./components.tsx";
export default function Pricing() {
  const { user, setUser } = useAuth(),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [errors, setErrors] = useState<Record<string, string>>({}),
    [values, setValues] = useState({
      name: "",
      cardNumber: "",
      expiry: "",
      cvc: "",
      confirmSimulation: false,
    });
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);
  const close = () => {
    if (!busy) {
      setOpen(false);
      setValues({
        name: "",
        cardNumber: "",
        expiry: "",
        cvc: "",
        confirmSimulation: false,
      });
      setErrors({});
    }
  };
  return (
    <main className="page">
      <p className="eyebrow">Choose how you read</p>
      <h1>A plan for every curious mind.</h1>
      <p>
        Both plans let you write and take part. Paid also unlocks published
        member-only posts.
      </p>
      <div className="plans">
        <section className="plan-card">
          <h2>Free</h2>
          <strong className="price">$0</strong>
          <ul>
            <li>Read public posts</li>
            <li>Create questions and articles</li>
            <li>Receive editorial feedback</li>
          </ul>
          {!user && (
            <Link className="button secondary" to="/signup">
              Create an account
            </Link>
          )}
          {user?.plan === "free" && <span className="badge">Current plan</span>}
        </section>
        <section className="plan-card featured">
          <span className="badge">More to explore</span>
          <h2>Paid</h2>
          <strong className="price">
            $9 <small>/ month, demonstration price</small>
          </strong>
          <ul>
            <li>Everything in Free</li>
            <li>Read published paid articles</li>
            <li>Read published paid questions</li>
          </ul>
          <button
            disabled={!user || user.plan === "paid"}
            onClick={() => {
              setMessage("");
              setOpen(true);
            }}
          >
            {user?.plan === "paid" ? "Paid plan active" : "Upgrade plan"}
          </button>
          {!user && (
            <p>
              <Link to="/login">Log in</Link> to upgrade.
            </p>
          )}
        </section>
      </div>
      <p className="muted">
        This is a payment simulation. There is no payment gateway, real charge
        or recurring billing.
      </p>
      {message && <Notice>{message}</Notice>}
      <dialog
        ref={dialog}
        onCancel={(e) => {
          e.preventDefault();
          close();
        }}
        aria-labelledby="upgrade-title"
      >
        <div className="dialog-head">
          <h2 id="upgrade-title">Upgrade to Paid</h2>
          <button
            className="text-button"
            onClick={close}
            disabled={busy}
            aria-label="Close upgrade"
          >
            Close
          </button>
        </div>
        <p>
          Use test card <strong>4242 4242 4242 4242</strong>, a future expiry
          and any three-digit test CVC. Do not enter real payment details.
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy) return;
            const result = upgradeSchema.safeParse({
              ...values,
              cardNumber: values.cardNumber.replace(/\s/g, ""),
            });
            if (!result.success) {
              setErrors(fieldErrors(result.error));
              return;
            }
            setBusy(true);
            setErrors({});
            try {
              const d = await request<{ user: PublicUser; message: string }>(
                "/subscription/upgrade",
                json(result.data),
              );
              setUser(d.user);
              setMessage(d.message);
              setOpen(false);
              setValues({
                name: "",
                cardNumber: "",
                expiry: "",
                cvc: "",
                confirmSimulation: false,
              });
            } catch (e) {
              setErrors(
                e instanceof ApiError
                  ? { ...e.errors, form: e.message }
                  : { form: (e as Error).message },
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field
            label="Name on test card"
            name="name"
            value={values.name}
            error={errors.name}
            onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
          />
          <Field
            label="Test card number"
            name="cardNumber"
            inputMode="numeric"
            value={values.cardNumber}
            error={errors.cardNumber}
            onChange={(e) =>
              setValues((v) => ({ ...v, cardNumber: e.target.value }))
            }
          />
          <div className="two-col">
            <Field
              label="Expiry (MM/YY)"
              name="expiry"
              value={values.expiry}
              error={errors.expiry}
              onChange={(e) =>
                setValues((v) => ({ ...v, expiry: e.target.value }))
              }
            />
            <Field
              label="Test CVC"
              name="cvc"
              inputMode="numeric"
              maxLength={3}
              value={values.cvc}
              error={errors.cvc}
              onChange={(e) =>
                setValues((v) => ({ ...v, cvc: e.target.value }))
              }
            />
          </div>
          <label className="check">
            <input
              type="checkbox"
              checked={values.confirmSimulation}
              onChange={(e) =>
                setValues((v) => ({
                  ...v,
                  confirmSimulation: e.target.checked,
                }))
              }
            />
            I understand this is a simulation and no charge is made.
          </label>
          {errors.confirmSimulation && (
            <Notice error>Confirm the simulation.</Notice>
          )}
          {errors.form && <Notice error>{errors.form}</Notice>}
          <button disabled={busy}>
            {busy ? "Updating plan…" : "Confirm simulated upgrade"}
          </button>
        </form>
      </dialog>
    </main>
  );
}
